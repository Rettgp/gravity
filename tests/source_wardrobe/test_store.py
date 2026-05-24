from unittest.mock import MagicMock, patch

from source_wardrobe.store import (
    ensure_schema,
    get_catalog,
    get_items_by_ids,
    get_person,
    person_exists,
    search_items,
    upsert_item,
    upsert_person,
    upsert_pose,
)


def _mock_conn() -> MagicMock:
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    return conn


# --- ensure_schema ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_ensure_schema_creates_extension_and_tables(mock_connect, _mock_reg):
    conn = _mock_conn()
    mock_connect.return_value = conn
    ensure_schema()
    sql_calls = [str(c.args[0]) for c in conn.execute.call_args_list]
    assert any("CREATE EXTENSION" in s for s in sql_calls)
    assert any("wardrobe_persons" in s for s in sql_calls)
    assert any("wardrobe_items" in s for s in sql_calls)
    assert any("wardrobe_outfits" in s for s in sql_calls)


# --- upsert_person ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_upsert_person_executes_insert(mock_connect, _mock_reg):
    conn = _mock_conn()
    mock_connect.return_value = conn
    upsert_person("garrett", "Garrett")
    sql = conn.execute.call_args[0][0]
    assert "wardrobe_persons" in sql
    params = conn.execute.call_args[0][1]
    assert params[0] == "garrett"
    assert params[1] == "Garrett"


# --- upsert_pose ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_upsert_pose_updates_person_row(mock_connect, _mock_reg):
    conn = _mock_conn()
    mock_connect.return_value = conn
    upsert_pose("garrett", "/path/pose.jpg", "Athletic build, medium skin tone.")
    params = conn.execute.call_args[0][1]
    assert params[0] == "/path/pose.jpg"
    assert "Athletic build" in params[1]
    assert params[2] == "garrett"


# --- person_exists ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_person_exists_returns_true_when_found(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = (1,)
    mock_connect.return_value = conn
    assert person_exists("garrett") is True


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_person_exists_returns_false_when_not_found(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = None
    mock_connect.return_value = conn
    assert person_exists("nobody") is False


# --- get_person ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_person_returns_dict_when_found(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = (
        "garrett", "Garrett", "/path/pose.jpg", "Athletic build."
    )
    mock_connect.return_value = conn
    person = get_person("garrett")
    assert person is not None
    assert person["label"] == "garrett"
    assert person["display_name"] == "Garrett"
    assert person["pose_description"] == "Athletic build."


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_person_returns_none_when_not_found(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = None
    mock_connect.return_value = conn
    assert get_person("nobody") is None


# --- upsert_item ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_upsert_item_returns_id(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = (42,)
    mock_connect.return_value = conn
    item_id = upsert_item(
        person_label="garrett",
        image_path="/path/shirt.jpg",
        description="White dress shirt",
        category="tops",
        seasons=["spring", "summer"],
        occasions=["business"],
        colors=["white"],
        embedding=[0.1] * 384,
    )
    assert item_id == 42


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_upsert_item_passes_correct_params(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = (1,)
    mock_connect.return_value = conn
    upsert_item(
        person_label="garrett",
        image_path="/path/shirt.jpg",
        description="White dress shirt",
        category="tops",
        seasons=["spring"],
        occasions=["business"],
        colors=["white"],
        embedding=[0.0] * 384,
    )
    params = conn.execute.call_args[0][1]
    assert params[0] == "garrett"
    assert params[1] == "/path/shirt.jpg"
    assert params[2] == "White dress shirt"
    assert params[3] == "tops"


# --- search_items ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_search_items_returns_list_of_dicts(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = [
        (1, "/path/shirt.jpg", "White dress shirt", "tops", ["spring"], ["business"], ["white"]),
    ]
    mock_connect.return_value = conn
    results = search_items("garrett", [0.1] * 384)
    assert len(results) == 1
    assert results[0]["id"] == 1
    assert results[0]["description"] == "White dress shirt"
    assert results[0]["category"] == "tops"


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_search_items_filters_by_season_and_occasion(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = []
    mock_connect.return_value = conn
    search_items("garrett", [0.0] * 384, seasons=["summer"], occasions=["casual"])
    sql = conn.execute.call_args[0][0]
    assert "seasons" in sql
    assert "occasions" in sql


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_search_items_returns_empty_list_when_none_found(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = []
    mock_connect.return_value = conn
    assert search_items("garrett", [0.0] * 384) == []


# --- get_catalog ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_catalog_returns_all_items_without_filters(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = [
        (1, "/path/shirt.jpg", "Blue shirt", "tops", ["spring"], ["casual"], ["blue"]),
        (2, "/path/jeans.jpg", "Dark jeans", "bottoms", ["fall"], ["casual"], ["navy"]),
    ]
    mock_connect.return_value = conn
    results = get_catalog("garrett")
    assert len(results) == 2


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_catalog_adds_category_filter_when_provided(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = []
    mock_connect.return_value = conn
    get_catalog("garrett", category="tops")
    sql = conn.execute.call_args[0][0]
    params = conn.execute.call_args[0][1]
    assert "category" in sql
    assert "tops" in params


# --- get_items_by_ids ---

@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_items_by_ids_returns_matching_items(mock_connect, _mock_reg):
    conn = _mock_conn()
    conn.execute.return_value.fetchall.return_value = [
        (5, "/path/blazer.jpg", "Navy blazer", "outerwear", ["fall"], ["business"], ["navy"], "garrett"),
    ]
    mock_connect.return_value = conn
    results = get_items_by_ids([5])
    assert len(results) == 1
    assert results[0]["id"] == 5
    assert results[0]["person_label"] == "garrett"


@patch("source_wardrobe.store.register_vector")
@patch("source_wardrobe.store.psycopg.connect")
def test_get_items_by_ids_returns_empty_list_for_empty_input(mock_connect, _mock_reg):
    conn = _mock_conn()
    mock_connect.return_value = conn
    assert get_items_by_ids([]) == []
    conn.execute.assert_not_called()
