"""Validate the actual model/index and encode a bundled pose without API calls."""
import numpy as np
from PIL import Image
import search

model, preprocess, tokenizer, ids, matrix, metadata = search.load()
assert len(ids) == 99117, f'Unexpected eligible artwork count: {len(ids)}'
assert len(set(ids)) == len(ids) and np.isfinite(matrix).all()
image, text = search.encode(Image.open(search.POSES/'gallery/1321-authored.png').convert('RGB'), ['A standing figure with crossed arms'])
assert image.shape == (matrix.shape[1],) and text.shape == (1, matrix.shape[1])
assert np.isfinite(image).all() and np.isfinite(text).all()
assert float(np.linalg.norm(image)) > .99
print(f'References ready: {len(ids):,} eligible artworks, local MobileCLIP image/text encoding verified.', flush=True)
