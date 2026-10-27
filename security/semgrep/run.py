"""Semgrep CE runner, fail closed; Python stdlib only. Does not execute application code."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
TOOL = json.loads((ROOT / 'security/semgrep/toolchain.json').read_text(encoding='utf-8'))
TARGETS = ['frontend/src', 'backend/src', 'scripts']


def gate(exit_code, report, sarif, targets=TARGETS):
    problems = []
    if exit_code != 0:
        problems.append(f'Scanner exit code: {exit_code}')
    if not isinstance(report, dict):
        return problems + ['Missing/invalid scanner JSON']
    if report.get('version') != TOOL['version']:
        problems.append('Unexpected/missing Semgrep version')
    if report.get('errors'):
        problems.append('Scanner reported analysis errors')
    if not isinstance(report.get('results'), list):
        problems.append('Missing findings array')
    elif report['results']:
        problems.append(f"Findings: {len(report['results'])}; all configured severities block")
    paths = report.get('paths')
    scanned = paths.get('scanned', []) if isinstance(paths, dict) else []
    if not isinstance(scanned, list) or any(not isinstance(p, str) for p in scanned):
        problems.append('Invalid scanned files array')
        scanned = []
    normalized = [str(p).replace('\\', '/').removeprefix('./') for p in scanned]
    if not normalized:
        problems.append('No files scanned')
    for target in targets:
        if not any(p.startswith(target + '/') for p in normalized):
            problems.append(f'No scanned files in required root: {target}')
    if not isinstance(sarif, dict) or sarif.get('version') != '2.1.0' or not sarif.get('runs'):
        problems.append('Missing/invalid SARIF')
    return problems


def environment():
    env = os.environ.copy()
    env.pop('SEMGREP_APP_TOKEN', None)
    env['SEMGREP_SEND_METRICS'] = 'off'
    env['SEMGREP_ENABLE_VERSION_CHECK'] = '0'
    return env


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def scan_command(json_file, sarif_file, targets, config=None):
    return ['semgrep', 'scan', '--oss-only', '--metrics=off', '--disable-version-check',
            '--strict', '--error', '--no-rewrite-rule-ids', '--verbose',
            '--config', str(config or ROOT / 'security/semgrep/rules'),
            '--json-output', str(json_file), '--sarif-output', str(sarif_file), *targets]


def main():
    out = ROOT / 'reportes/ci/semgrep'
    out.mkdir(parents=True, exist_ok=True)
    # Invalidate old output before a new run; never accredit stale scanner artifacts.
    for name in ['scan.json', 'scan.sarif']:
        (out / name).unlink(missing_ok=True)
    report = sarif = None
    exit_code = None
    failure = None
    version = 'NOT_EXECUTED'
    try:
        checked = subprocess.run(['semgrep', '--version'], cwd=ROOT, env=environment(), capture_output=True, text=True, timeout=30)
        version = checked.stdout.strip()
        if checked.returncode != 0 or version != TOOL['version']:
            raise RuntimeError('Semgrep executable missing, failed or version differs from toolchain.json')
        result = subprocess.run(scan_command(out / 'scan.json', out / 'scan.sarif', TARGETS),
                                cwd=ROOT, env=environment(), capture_output=True, text=True, timeout=600)
        exit_code = result.returncode
        (out / 'scanner.log').write_text(result.stdout + '\n' + result.stderr, encoding='utf-8')
        report, sarif = read_json(out / 'scan.json'), read_json(out / 'scan.sarif')
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        # No subprocess environment, private config or raw exception body is reflected.
        failure = type(exc).__name__ + ': scanner unavailable, wrong version or execution failed'
    problems = gate(exit_code, report, sarif)
    if failure:
        problems.append(failure)
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    rules = [{'file': p.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
             for p in sorted((ROOT / 'security/semgrep/rules').glob('*.yml'))]
    safe_report = report if isinstance(report, dict) else {}
    safe_paths = safe_report.get('paths') if isinstance(safe_report.get('paths'), dict) else {}
    safe_findings = safe_report.get('results') if isinstance(safe_report.get('results'), list) else []
    status = {'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'commit': commit,
              'expected_version': TOOL['version'], 'observed_version': version,
              'scanner_exit_code': exit_code, 'passed': not problems, 'problems': problems,
              'rules': rules, 'targets': TARGETS,
              'scanned': safe_paths.get('scanned', []) if isinstance(safe_paths.get('scanned', []), list) else [],
              'skipped': safe_paths.get('skipped', []) if isinstance(safe_paths.get('skipped', []), list) else [],
              'errors': safe_report.get('errors', []),
              'findings': [{'rule': r.get('check_id'), 'file': r.get('path'), 'line': r.get('start', {}).get('line'),
                            'severity': r.get('extra', {}).get('severity')}
                           for r in safe_findings if isinstance(r, dict)],
              'limitations': 'SAST with six local rules; not DAST, not full vulnerability coverage'}
    (out / 'status.json').write_text(json.dumps(status, indent=2), encoding='utf-8')
    text = '\n'.join(['# Semgrep CE SAST — ' + ('PASSED' if status['passed'] else 'FAILED / INCOMPLETE'),
                      f'Commit: {commit}', f'Expected version: {TOOL["version"]}; observed: {version}',
                      f'Rules files: {len(rules)} (six rules); scanned files: {len(status["scanned"])}',
                      f'Skipped: {len(status["skipped"])}; errors: {len(status["errors"])}; findings: {len(status["findings"])}',
                      'Zero findings is not proof of zero vulnerabilities.',
                      '## Gates', *['- ' + item for item in problems],
                      '## Rule file hashes', *['- ' + r['file'] + ': ' + r['sha256'] for r in rules],
                      '## Files scanned', *['- ' + p for p in status['scanned']],
                      '## Skipped files and reasons (scanner JSON)', json.dumps(status['skipped'], ensure_ascii=False),
                      '## Errors (scanner JSON)', json.dumps(status['errors'], ensure_ascii=False),
                      '## Findings (no source snippets)', json.dumps(status['findings'], ensure_ascii=False)]) + '\n'
    (out / 'summary.md').write_text(text, encoding='utf-8')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
            stream.write(text)
    print(f'Semgrep: {"PASSED" if status["passed"] else "FAILED / INCOMPLETE"}; see reportes/ci/semgrep/summary.md')
    return 0 if status['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
