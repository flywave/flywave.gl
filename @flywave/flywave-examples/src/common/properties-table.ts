/* Copyright (C) 2025 flywave.gl contributors */

/**
 * A floating properties table overlay component.
 *
 * Ported from `src/3dtiles-animation/PropertiesTable.ts` as a reusable common component. The
 * public API (`show`) is kept identical to the original implementation so existing examples can
 * switch to this import without further changes.
 *
 * The table is appended to `document.body`, anchored to the top-right corner of the viewport and
 * shows a closable two-column ("Property" / "Value") table for the given record.
 */
export class PropertiesTable {
    private m_container: HTMLElement | null = null;
    private m_table: HTMLTableElement | null = null;

    /**
     * Shows the table with the given properties.
     *
     * Creates the DOM structure on first call, afterwards the table is reused and its content is
     * replaced.
     *
     * @param properties - A flat record of property names to display values.
     */
    show(properties: Record<string, unknown> | object): void {
        if (!this.m_container) {
            this.createTable();
        } else {
            this.m_container.style.display = "block";
        }

        this.updateContent(properties);
    }

    private createTable(): void {
        // Check if table already exists, if so remove it (e.g. after a hot reload).
        const existingTable = document.getElementById("properties-table");
        if (existingTable) {
            existingTable.remove();
        }

        // Create table container
        this.m_container = document.createElement("div");
        this.m_container.id = "properties-table";
        this.m_container.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 350px;
      max-height: 400px;
      background: rgba(30, 30, 30, 0.9);
      color: #ddd;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 8px;
      overflow-y: auto;
      z-index: 1000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    `;

        // Create title
        const title = document.createElement("div");
        title.textContent = "Properties";
        title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      margin: 0 0 8px 0;
      color: #66aaff;
      padding-bottom: 6px;
      border-bottom: 1px solid #555;
      text-align: center;
    `;

        this.m_container.appendChild(title);

        // Add close button
        const closeButton = document.createElement("button");
        closeButton.textContent = "×";
        closeButton.style.cssText = `
      position: absolute;
      top: 6px;
      right: 8px;
      background: #444;
      color: #ddd;
      border: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 16px;
      text-align: center;
    `;

        closeButton.onclick = () => {
            if (this.m_container) {
                this.m_container.style.display = "none";
            }
        };

        this.m_container.appendChild(closeButton);

        // Add empty table
        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.id = "properties-inner-table";

        // Set table layout to fixed to control column width
        table.style.tableLayout = "fixed";

        const headerRow = document.createElement("tr");
        // Set column width ratio
        headerRow.innerHTML =
            '<th style="width: 40%; text-align: left; padding: 4px 6px; font-size: 11px; color: #66aaff; background-color: #2a2a2a;">Property</th><th style="width: 60%; text-align: left; padding: 4px 6px; font-size: 11px; color: #66aaff; background-color: #2a2a2a;">Value</th>';
        table.appendChild(headerRow);

        this.m_container.appendChild(table);
        this.m_table = table;

        // Add table to page
        document.body.appendChild(this.m_container);
    }

    private updateContent(properties: Record<string, unknown> | object): void {
        if (!this.m_container || !this.m_table) {
            return;
        }

        const table = this.m_table;

        // Clear existing content (keep header row)
        while (table.rows.length > 1) {
            table.deleteRow(1);
        }

        const record = properties as Record<string, unknown>;

        // Add property rows
        for (const key in record) {
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                const value = record[key];
                const row = table.insertRow();
                // Use word-wrap: break-word to ensure long content wraps instead of horizontal
                // scrolling
                row.innerHTML = `<td style="padding: 4px 6px; border-bottom: 1px solid #333; color: #88ccff; word-wrap: break-word; white-space: normal; font-size: 12px; font-weight: 500;">${key}</td><td style="padding: 4px 6px; border-bottom: 1px solid #333; color: #ddd; word-wrap: break-word; white-space: normal; font-size: 12px;">${value}</td>`;
            }
        }
    }
}
