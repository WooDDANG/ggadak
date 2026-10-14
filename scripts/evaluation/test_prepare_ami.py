"""NXT reference and input-normalization regression checks."""

import io
import unittest
import zipfile

from prepare_ami import Corpus, number


class CorpusTest(unittest.TestCase):
    def setUp(self):
        self.buffer = io.BytesIO()
        with zipfile.ZipFile(self.buffer, "w") as archive:
            archive.writestr(
                "words/M.A.words.xml",
                '<root xmlns:nite="http://nite.sourceforge.net/">'
                '<w nite:id="w9">one</w><w nite:id="w11">two</w>'
                '<w nite:id="w10">three</w></root>',
            )
        self.archive = zipfile.ZipFile(self.buffer)
        self.corpus = Corpus(self.archive)

    def tearDown(self):
        self.archive.close()

    def test_range_uses_document_order_not_numeric_suffix(self):
        words = self.corpus.resolve("M.A.words.xml#id(w9)..id(w10)", "dialogueActs/M.A.xml")
        self.assertEqual([w.text for w in words], ["one", "two", "three"])

    def test_missing_target_is_reported_not_fabricated(self):
        self.assertEqual(self.corpus.resolve("M.A.words.xml#id(missing)", "origin.xml"), [])
        self.assertEqual(len(self.corpus.issues), 1)

    def test_reversed_range_is_reported(self):
        self.assertEqual(self.corpus.resolve("M.A.words.xml#id(w10)..id(w9)", "origin.xml"), [])
        self.assertEqual(len(self.corpus.issues), 1)

    def test_missing_and_nonfinite_timings_remain_missing(self):
        for value in [None, "NaN", "Infinity", "unknown"]:
            self.assertIsNone(number(value))
        self.assertEqual(number("1.25"), 1.25)


if __name__ == "__main__":
    unittest.main()
