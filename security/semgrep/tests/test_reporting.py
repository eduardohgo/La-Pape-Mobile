"""Unit tests of fail-closed reporting, NOT evidence of a Semgrep scan."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sast_runner', Path(__file__).resolve().parents[1] / 'run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class GateTests(unittest.TestCase):
    def valid(self):
        return {'version': runner.TOOL['version'], 'errors': [], 'results': [],
                'paths': {'scanned': ['frontend/src/app.tsx', 'backend/src/app.js', 'scripts/ci/report.mjs']}}

    def sarif(self):
        return {'version': '2.1.0', 'runs': [{'tool': {'driver': {'name': 'Semgrep'}}}]}

    def test_clean_success(self):
        self.assertEqual(runner.gate(0, self.valid(), self.sarif()), [])

    def test_finding_blocks_even_if_scanner_returns_zero(self):
        report = self.valid()
        report['results'] = [{'check_id': 'synthetic'}]
        self.assertTrue(runner.gate(0, report, self.sarif()))

    def test_nonzero_exit_blocks(self):
        for code in [1, 2, 3, 4, 5, 7, None]:
            with self.subTest(code=code):
                self.assertTrue(runner.gate(code, self.valid(), self.sarif()))

    def test_missing_json_and_sarif_block(self):
        self.assertTrue(runner.gate(0, None, self.sarif()))
        self.assertTrue(runner.gate(0, self.valid(), None))

    def test_parser_errors_block(self):
        report = self.valid()
        report['errors'] = [{'type': 'Parse error'}]
        self.assertTrue(runner.gate(0, report, self.sarif()))

    def test_empty_scan_blocks(self):
        report = self.valid()
        report['paths']['scanned'] = []
        self.assertTrue(runner.gate(0, report, self.sarif()))

    def test_missing_required_root_blocks(self):
        report = self.valid()
        report['paths']['scanned'].pop()
        self.assertTrue(runner.gate(0, report, self.sarif()))

    def test_wrong_version_blocks(self):
        report = self.valid()
        report['version'] = 'unexpected'
        self.assertTrue(runner.gate(0, report, self.sarif()))

    def test_malformed_paths_block(self):
        for paths in [None, [], {'scanned': None}, {'scanned': [42]}]:
            with self.subTest(paths=paths):
                report = self.valid()
                report['paths'] = paths
                self.assertTrue(runner.gate(0, report, self.sarif()))


if __name__ == '__main__':
    unittest.main()
