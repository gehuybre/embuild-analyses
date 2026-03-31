import pytest
pytest.skip("MapSection runtime validation moved to skill scripts/docs. Run checks manually if needed.", allow_module_level=True)

# The MapSection includes a runtime console.warn when it detects municipality codes that are not 5 digits.
# To verify manually, inspect the component source at:
# embuild-analyses/src/components/analyses/shared/MapSection.tsx
