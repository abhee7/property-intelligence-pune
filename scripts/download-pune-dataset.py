"""Downloads the Pune real-estate listings dataset from Kaggle into data/pune-real-estate/listings.csv

    pip install kagglehub
    python scripts/download-pune-dataset.py

Source: https://www.kaggle.com/datasets/shubham001official/pune-real-estate-listings-dataset
Public dataset — no Kaggle login needed. Check the dataset's licence on that page before
redistributing it.
"""
import shutil
import tempfile
from pathlib import Path

import kagglehub

HANDLE = "shubham001official/pune-real-estate-listings-dataset"
TARGET = Path(__file__).resolve().parent.parent / "data" / "pune-real-estate" / "listings.csv"

with tempfile.TemporaryDirectory() as tmp:
    folder = Path(kagglehub.dataset_download(HANDLE, output_dir=tmp))
    csvs = sorted(folder.glob("*.csv"))
    if not csvs:
        raise SystemExit(f"No CSV found in the downloaded dataset ({folder})")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(csvs[0], TARGET)

print(f"Saved {csvs[0].name} → {TARGET}")
