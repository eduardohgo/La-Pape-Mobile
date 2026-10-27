"""Real scanner fixture verification. No production code or network is executed."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import run

EXPECTED = {'lapape.dynamic-code', 'lapape.tls-validation-disabled', 'lapape.request-data-in-sql',
            'lapape.request-data-in-shell', 'lapape.react-raw-html', 'lapape.weak-token-randomness'}


def main():
    out = run.ROOT / 'reportes/ci/semgrep/fixtures'
    out.mkdir(parents=True, exist_ok=True)
    results = []
    unavailable = None
    try:
        version = subprocess.check_output(['semgrep', '--version'], env=run.environment(), text=True, timeout=30).strip()
        if version != run.TOOL['version']:
            raise RuntimeError('Wrong scanner version')
        # Outside the repository: fixture exclusions cannot hide the intentional matches.
        with tempfile.TemporaryDirectory(prefix='lapape-semgrep-') as temp:
            cwd = Path(temp)
            (cwd / 'invalid.yml').write_text('rules: [\n', encoding='utf-8')
            for name in ['positive', 'negative']:
                shutil.copyfile(run.ROOT / f'security/semgrep/tests/{name}.tsx', cwd / f'{name}.tsx')
            for name in ['positive', 'negative', 'invalid']:
                js, sarif = out / f'{name}.json', out / f'{name}.sarif'
                js.unlink(missing_ok=True)
                sarif.unlink(missing_ok=True)
                target = 'negative.tsx' if name == 'invalid' else f'{name}.tsx'
                config = cwd / 'invalid.yml' if name == 'invalid' else None
                result = subprocess.run(run.scan_command(js, sarif, [target], config), cwd=cwd,
                                        env=run.environment(), capture_output=True, text=True, timeout=90)
                (out / f'{name}.log').write_text(result.stdout + '\n' + result.stderr, encoding='utf-8')
                report, sarif_report = run.read_json(js), run.read_json(sarif)
                identifiers = {r['check_id'] for r in (report or {}).get('results', [])}
                scanned = (report or {}).get('paths', {}).get('scanned', [])
                errors = (report or {}).get('errors', [])
                artifacts = report is not None and sarif_report is not None
                if name == 'positive':
                    passed = result.returncode == 1 and identifiers == EXPECTED and bool(scanned) and not errors and artifacts
                elif name == 'negative':
                    passed = result.returncode == 0 and not identifiers and bool(scanned) and not errors and artifacts
                else:
                    passed = result.returncode not in [0, 1]
                results.append({'case': name, 'passed': passed, 'exit_code': result.returncode,
                                'rule_ids': sorted(identifiers), 'scanned': scanned, 'errors': errors,
                                'json_sarif_generated': artifacts})
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        unavailable = type(exc).__name__ + ': Semgrep missing, wrong version or process failed'
    status = {'passed': len(results) == 3 and all(r['passed'] for r in results),
              'expected_rule_ids': sorted(EXPECTED), 'cases': results, 'limitation': unavailable}
    (out / 'verification.json').write_text(json.dumps(status, indent=2), encoding='utf-8')
    print(json.dumps(status, indent=2))
    return 0 if status['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
