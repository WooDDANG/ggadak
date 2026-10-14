import copy
import hashlib
import json
import unittest

from evaluation_gold import counts, score, validate


class GoldTest(unittest.TestCase):
    def test_duplicate_semantic_matches_cannot_inflate_recall(self):
        with self.assertRaises(ValueError):
            counts([['p1', 'g1'], ['p2', 'g1']], {'p1', 'p2'}, {'g1'})

    def test_hand_worked_counts(self):
        self.assertEqual(counts([['p1', 'g1']], {'p1', 'p2'}, {'g1', 'g2', 'g3'}), {'tp': 1, 'fp': 1, 'fn': 2})

    def test_official_summary_is_not_complete_service_gold(self):
        with self.assertRaises(ValueError):
            validate([{'meetingId': 'm', 'groupId': 'm', 'split': 'test', 'datasetKind': 'ami', 'gold': {'reviewed': True, 'revision': 'original', 'complete': True, 'candidates': [], 'relations': []}}])

    def test_relation_match_must_preserve_type_and_mapped_endpoints(self):
        gold = [{'meetingId': 'm', 'groupId': 'm', 'split': 'test', 'language': 'ko', 'datasetKind': 'service', 'gold': {'reviewed': True, 'revision': '1', 'complete': True, 'candidates': [{'id': 'g1'}], 'nodeIds': ['g2'], 'relations': [{'id': 'ge', 'type': 'depends_on', 'sourceId': 'g1', 'targetId': 'g2'}]}}]
        method = {'outcome': 'completed', 'candidates': [{'id': 'p1'}], 'relations': [{'id': 'pe', 'type': 'conflicts_with', 'sourceId': 'p1', 'targetId': 'p2'}]}
        run = {'records': [{'meetingId': 'm', 'baseline': method, 'workflow': copy.deepcopy(method)}]}
        matches = {'candidateMatches': [['p1', 'g1']], 'nodeMatches': [['p2', 'g2']], 'relationMatches': [['pe', 'ge']], 'falseClaims': 0, 'structureErrors': 0}
        judgments = {'reviewed': True, 'revision': '1', 'goldDigest': hashlib.sha256(json.dumps(gold, sort_keys=True, ensure_ascii=False).encode()).hexdigest(), 'records': [{'meetingId': 'm', 'baseline': matches, 'workflow': copy.deepcopy(matches)}]}
        with self.assertRaises(ValueError):
            score(gold, run, judgments)


if __name__ == '__main__':
    unittest.main()
