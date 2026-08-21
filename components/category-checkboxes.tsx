"use client";

type Category = { id: string; name: string };

export function CategoryCheckboxes({ categories, selectedIds, onChange }: { categories: Category[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  function toggle(categoryId: string, checked: boolean) {
    onChange(checked ? [...selectedIds, categoryId] : selectedIds.filter((id) => id !== categoryId));
  }

  return <fieldset className="span-2 category-checkbox-field">
    <legend>Part categories</legend>
    {categories.length ? <div className="category-checkbox-grid">{categories.map((category) => <label key={category.id}>
      <input type="checkbox" checked={selectedIds.includes(category.id)} onChange={(event) => toggle(category.id, event.target.checked)}/>
      <span>{category.name}</span>
    </label>)}</div> : <p>No active part categories are available.</p>}
    <small>Select one or more categories.</small>
  </fieldset>;
}
