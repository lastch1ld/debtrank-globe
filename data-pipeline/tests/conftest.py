import sys
from pathlib import Path

# The pipeline scripts are plain top-level modules (no package/__init__.py),
# so make them importable from tests/ by adding their directory to sys.path.
sys.path.insert(0, str(Path(__file__).parent.parent))
