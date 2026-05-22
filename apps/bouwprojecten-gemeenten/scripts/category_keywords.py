"""
Category mappings for classifying projects.

Supports two classification methods:
1. Policy-based: Uses Beleidsdomein/Beleidssubdomein from data-54.csv
2. Keyword-based: Falls back to keyword matching in project descriptions (legacy)

Each category has:
- id: unique identifier
- label: display name
- keywords: list of keywords to match in project descriptions (legacy)
- policy_domains: mapping of Beleidsdomein codes to subdomains (policy-based)
"""

# Direct Beleidsdomein to category mapping
# Maps the 10 main Beleidsdomein values directly (identity mapping)
POLICY_DOMAIN_MAPPING = {
    "00 Algemene financiering": "00-algemene-financiering",
    "00": "00-algemene-financiering",

    "01 Algemeen bestuur": "01-algemeen-bestuur",
    "01": "01-algemeen-bestuur",

    "02 Zich verplaatsen en mobiliteit": "02-mobiliteit",
    "02": "02-mobiliteit",

    "03 Natuur en milieubeheer": "03-natuur-milieu",
    "03": "03-natuur-milieu",

    "04 Veiligheidszorg": "04-veiligheidszorg",
    "04": "04-veiligheidszorg",

    "05 Ondernemen en werken": "05-ondernemen-werken",
    "05": "05-ondernemen-werken",

    "06 Wonen en ruimtelijke ordening": "06-wonen-ruimte",
    "06": "06-wonen-ruimte",

    "07 Cultuur en vrije tijd": "07-cultuur-vrije-tijd",
    "07": "07-cultuur-vrije-tijd",

    "08 Leren en onderwijs": "08-onderwijs",
    "08": "08-onderwijs",

    "09 Zorg en opvang": "09-zorg-opvang",
    "09": "09-zorg-opvang",
}

CATEGORY_DEFINITIONS = {
    "00-algemene-financiering": {
        "id": "00-algemene-financiering",
        "label": "Algemene financiering",
        "keywords": []  # Using policy domain classification
    },
    "01-algemeen-bestuur": {
        "id": "01-algemeen-bestuur",
        "label": "Algemeen bestuur",
        "keywords": []  # Using policy domain classification
    },
    "02-mobiliteit": {
        "id": "02-mobiliteit",
        "label": "Zich verplaatsen en mobiliteit",
        "keywords": []  # Using policy domain classification
    },
    "03-natuur-milieu": {
        "id": "03-natuur-milieu",
        "label": "Natuur en milieubeheer",
        "keywords": []  # Using policy domain classification
    },
    "04-veiligheidszorg": {
        "id": "04-veiligheidszorg",
        "label": "Veiligheidszorg",
        "keywords": []  # Using policy domain classification
    },
    "05-ondernemen-werken": {
        "id": "05-ondernemen-werken",
        "label": "Ondernemen en werken",
        "keywords": []  # Using policy domain classification
    },
    "06-wonen-ruimte": {
        "id": "06-wonen-ruimte",
        "label": "Wonen en ruimtelijke ordening",
        "keywords": []  # Using policy domain classification
    },
    "07-cultuur-vrije-tijd": {
        "id": "07-cultuur-vrije-tijd",
        "label": "Cultuur en vrije tijd",
        "keywords": []  # Using policy domain classification
    },
    "08-onderwijs": {
        "id": "08-onderwijs",
        "label": "Leren en onderwijs",
        "keywords": []  # Using policy domain classification
    },
    "09-zorg-opvang": {
        "id": "09-zorg-opvang",
        "label": "Zorg en opvang",
        "keywords": []  # Using policy domain classification
    }
}


def classify_project_by_policy_domain(beleidsdomein, beleidssubdomein=None):
    """
    Classify a project based on its policy domain (Beleidsdomein).

    This is the preferred method when policy category data is available.

    Args:
        beleidsdomein: The Beleidsdomein value (e.g., "06 Wonen en ruimtelijke ordening")
        beleidssubdomein: Optional Beleidssubdomein value for more precise categorization

    Returns:
        List of category IDs that match the policy domain
    """
    if not beleidsdomein:
        return ["overige"]

    categories = []

    # Try subdomain match first (most specific)
    if beleidssubdomein:
        # Try exact subdomain match
        if beleidssubdomein in POLICY_DOMAIN_MAPPING:
            category = POLICY_DOMAIN_MAPPING[beleidssubdomein]
            if category and category not in categories:
                categories.append(category)

        # Try subdomain prefix (e.g., "074" from "074 Sport")
        if not categories and beleidssubdomein:
            subdomain_prefix = beleidssubdomein.split()[0] if ' ' in beleidssubdomein else beleidssubdomein[:3]
            if subdomain_prefix in POLICY_DOMAIN_MAPPING:
                category = POLICY_DOMAIN_MAPPING[subdomain_prefix]
                if category and category not in categories:
                    categories.append(category)

    # If no subdomain classification, try domain
    if not categories:
        # Try exact domain match
        if beleidsdomein in POLICY_DOMAIN_MAPPING:
            category = POLICY_DOMAIN_MAPPING[beleidsdomein]
            if category and category not in categories:
                categories.append(category)

        # Try domain prefix (e.g., "06" from "06 Wonen en ruimtelijke ordening")
        if not categories and beleidsdomein:
            prefix = beleidsdomein.split()[0] if ' ' in beleidsdomein else beleidsdomein[:2]
            if prefix in POLICY_DOMAIN_MAPPING:
                category = POLICY_DOMAIN_MAPPING[prefix]
                if category and category not in categories:
                    categories.append(category)

    return categories if categories else ["overige"]


def classify_project(ac_short, ac_long):
    """
    Classify a project based on keywords in its short and long descriptions.

    Args:
        ac_short: Short description of the action
        ac_long: Long description of the action

    Returns:
        List of category IDs that match the project
    """
    text = f"{ac_short} {ac_long}".lower()
    categories = []

    for category_id, category_def in CATEGORY_DEFINITIONS.items():
        if any(keyword in text for keyword in category_def["keywords"]):
            categories.append(category_id)

    return categories if categories else ["overige"]


def get_category_label(category_id):
    """Get the display label for a category ID."""
    if category_id == "overige":
        return "Overige"
    return CATEGORY_DEFINITIONS.get(category_id, {}).get("label", category_id)


def get_category_emoji(category_id):
    """Emoji support removed; always return an empty string."""
    return ""


def summarize_projects_by_category(projects, top_n=5):
    """Summarize investments per category.

    Args:
        projects: list of project dicts produced by `process_projects` (must contain
                  'categories', 'total_amount', 'ac_code', 'ac_short', 'municipality', 'nis_code', 'yearly_amounts')
        top_n: number of top projects to include per category

    Returns:
        dict mapping category_id -> summary dict with keys:
            - id
            - label
            - project_count
            - total_amount
            - largest_projects: list of project summaries (sorted desc by amount),
              including action/plan/goal context fields used in the detail modal
    """
    import ast
    def _normalize_categories(raw):
        if raw is None:
            return ['overige']
        # Already a list/tuple
        if isinstance(raw, (list, tuple)):
            return list(raw) if raw else ['overige']
        # numpy array
        try:
            import numpy as _np
            if isinstance(raw, _np.ndarray):
                lst = raw.tolist()
                return lst if lst else ['overige']
        except Exception:
            pass
        # A string representation: try to parse as Python literal list
        if isinstance(raw, str):
            try:
                val = ast.literal_eval(raw)
                if isinstance(val, (list, tuple)):
                    return list(val) if val else ['overige']
                return [raw]
            except Exception:
                return [raw]
        # Fallback - wrap in list
        return [raw]

    # Collect projects per category
    cat_projects = {}
    for proj in projects:
        raw = proj.get('categories', [])
        cats = _normalize_categories(raw)
        for cat in cats:
            cat_projects.setdefault(cat, []).append(proj)

    # Ensure every known category is present
    all_cats = list(CATEGORY_DEFINITIONS.keys()) + ['overige']
    summaries = {}

    for cat_id in all_cats:
        plist = cat_projects.get(cat_id, [])
        total = round(sum(p.get('total_amount', 0) for p in plist), 2)
        count = len(plist)

        # Prepare largest projects (top_n)
        largest = sorted(plist, key=lambda p: p.get('total_amount', 0), reverse=True)[:top_n]
        largest_projects = []
        for p in largest:
            largest_projects.append({
                'ac_code': p.get('ac_code'),
                'ac_short': p.get('ac_short'),
                'ac_long': p.get('ac_long', ''),
                'ap_code': p.get('ap_code', ''),
                'ap_short': p.get('ap_short', ''),
                'ap_long': p.get('ap_long', ''),
                'bd_code': p.get('bd_code', ''),
                'bd_short': p.get('bd_short', ''),
                'bd_long': p.get('bd_long', ''),
                'municipality': p.get('municipality'),
                'nis_code': p.get('nis_code'),
                'total_amount': round(p.get('total_amount', 0), 2),
                'amount_per_capita': round(p.get('amount_per_capita', 0), 2),
                'yearly_amounts': p.get('yearly_amounts', {}),
                'yearly_per_capita': p.get('yearly_per_capita', {}),
            })

        summaries[cat_id] = {
            'id': cat_id,
            'label': get_category_label(cat_id),
            'project_count': count,
            'total_amount': total,
            'largest_projects': largest_projects,
        }

    return summaries


def get_category_investment_summary(projects, category_id, top_n=5):
    """Convenience wrapper returning the summary for a single category."""
    return summarize_projects_by_category(projects, top_n=top_n).get(category_id, {
        'id': category_id,
        'label': get_category_label(category_id),
        'project_count': 0,
        'total_amount': 0,
        'largest_projects': []
    })


def generate_category_description(projects):
    """
    Generate a human-readable description of all project categories with counts.
    Based on the 10 official Beleidsdomein categories.

    Args:
        projects: list of project dicts with 'categories' field

    Returns:
        str: Formatted description text for use in blog posts
    """
    summaries = summarize_projects_by_category(projects)

    # Define category order (by domein code)
    category_info = [
        ("00-algemene-financiering", "00 Algemene financiering"),
        ("01-algemeen-bestuur", "01 Algemeen bestuur"),
        ("02-mobiliteit", "02 Zich verplaatsen en mobiliteit"),
        ("03-natuur-milieu", "03 Natuur en milieubeheer"),
        ("04-veiligheidszorg", "04 Veiligheidszorg"),
        ("05-ondernemen-werken", "05 Ondernemen en werken"),
        ("06-wonen-ruimte", "06 Wonen en ruimtelijke ordening"),
        ("07-cultuur-vrije-tijd", "07 Cultuur en vrije tijd"),
        ("08-onderwijs", "08 Leren en onderwijs"),
        ("09-zorg-opvang", "09 Zorg en opvang"),
    ]

    lines = ["Projecten zijn automatisch ingedeeld op basis van hun beleidsdomein:\n"]

    # Add categories with counts
    for cat_id, label in category_info:
        count = summaries.get(cat_id, {}).get('project_count', 0)
        if count > 0:
            # Format number with dot as thousands separator (Dutch style)
            count_formatted = f"{count:,}".replace(',', '.')
            lines.append(f"- **{label}** ({count_formatted} projecten)")

    # Add "overige" at the end
    overige_count = summaries.get('overige', {}).get('project_count', 0)
    if overige_count > 0:
        count_formatted = f"{overige_count:,}".replace(',', '.')
        lines.append(f"- **overige** ({count_formatted} projecten) - projecten zonder beleidsdomein")

    return '\n'.join(lines)
