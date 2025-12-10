// Properties table component
export class PropertiesTable {
  private container: HTMLElement | null = null;
  
  show(properties: any) {
    if (!this.container) {
      this.createTable();
    } else {
      this.container.style.display = 'block';
    }
    
    this.updateContent(properties);
  }
  
  private createTable() {
    // Check if table already exists, if so remove it
    let existingTable = document.getElementById('properties-table');
    if (existingTable) {
      existingTable.remove();
    }
    
    // Create table container
    this.container = document.createElement('div');
    this.container.id = 'properties-table';
    this.container.style.cssText = `
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
    const title = document.createElement('div');
    title.textContent = 'Properties';
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      margin: 0 0 8px 0;
      color: #66aaff;
      padding-bottom: 6px;
      border-bottom: 1px solid #555;
      text-align: center;
    `;
    
    this.container.appendChild(title);
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
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
      if (this.container) this.container.style.display = 'none';
    };
    
    this.container.appendChild(closeButton);
    
    // Add empty table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.id = 'properties-inner-table';
    
    // Set table layout to fixed to control column width
    table.style.tableLayout = 'fixed';
    
    const headerRow = document.createElement('tr');
    // Set column width ratio
    headerRow.innerHTML = '<th style="width: 40%; text-align: left; padding: 4px 6px; font-size: 11px; color: #66aaff; background-color: #2a2a2a;">Property</th><th style="width: 60%; text-align: left; padding: 4px 6px; font-size: 11px; color: #66aaff; background-color: #2a2a2a;">Value</th>';
    table.appendChild(headerRow);
    
    this.container.appendChild(table);
    
    // Add table to page
    document.body.appendChild(this.container);
  }
  
  private updateContent(properties: any) {
    if (!this.container) return;
    
    const table = document.getElementById('properties-inner-table') as HTMLTableElement;
    if (!table) return;

    // Clear existing content (keep header row)
    while (table.rows.length > 1) {
      table.deleteRow(1);
    }

    // Add property rows
    for (const key in properties) {
      if (properties.hasOwnProperty(key)) {
        const value = properties[key];
        const row = table.insertRow();
        // Use word-wrap: break-word to ensure long content wraps instead of horizontal scrolling
        row.innerHTML = `<td style="padding: 4px 6px; border-bottom: 1px solid #333; color: #88ccff; word-wrap: break-word; white-space: normal; font-size: 12px; font-weight: 500;">${key}</td><td style="padding: 4px 6px; border-bottom: 1px solid #333; color: #ddd; word-wrap: break-word; white-space: normal; font-size: 12px;">${value}</td>`;
      }
    }
  }
}