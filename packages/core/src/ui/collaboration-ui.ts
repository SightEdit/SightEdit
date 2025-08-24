/**
 * UI component for displaying collaboration features
 */

import { CollaboratorInfo } from '../collaboration';

export class CollaborationUI {
  private container: HTMLElement;
  private collaboratorsList: HTMLElement;
  private collaborators: Map<string, HTMLElement> = new Map();
  private isVisible = false;

  constructor() {
    this.container = this.createContainer();
    this.collaboratorsList = this.createCollaboratorsList();
    this.container.appendChild(this.collaboratorsList);
    document.body.appendChild(this.container);
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'sight-edit-collaboration';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 12px;
      min-width: 200px;
      max-width: 300px;
      z-index: 10001;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Add header
    const header = document.createElement('div');
    header.style.cssText = `
      font-weight: 600;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const icon = document.createElement('span');
    icon.innerHTML = '👥';
    header.appendChild(icon);
    
    const title = document.createElement('span');
    title.textContent = 'Active Collaborators';
    header.appendChild(title);
    
    container.appendChild(header);
    
    return container;
  }

  private createCollaboratorsList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'sight-edit-collaborators-list';
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    return list;
  }

  public show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public addCollaborator(collaborator: CollaboratorInfo): void {
    if (this.collaborators.has(collaborator.id)) {
      return;
    }

    const item = document.createElement('div');
    item.className = 'sight-edit-collaborator-item';
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px;
      border-radius: 6px;
      transition: background-color 0.2s;
    `;

    // Avatar or color indicator
    const avatar = document.createElement('div');
    avatar.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: ${collaborator.color};
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 14px;
    `;
    
    if (collaborator.avatar) {
      avatar.style.backgroundImage = `url(${collaborator.avatar})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    } else {
      // Show initials
      const initials = collaborator.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      avatar.textContent = initials;
    }

    // Name and status
    const info = document.createElement('div');
    info.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
    `;

    const name = document.createElement('div');
    name.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      color: #1f2937;
    `;
    name.textContent = collaborator.name;

    const status = document.createElement('div');
    status.className = 'sight-edit-collaborator-status';
    status.style.cssText = `
      font-size: 12px;
      color: #6b7280;
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    const statusDot = document.createElement('span');
    statusDot.style.cssText = `
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #10b981;
    `;
    status.appendChild(statusDot);
    
    const statusText = document.createElement('span');
    statusText.textContent = 'Active';
    status.appendChild(statusText);

    info.appendChild(name);
    info.appendChild(status);

    item.appendChild(avatar);
    item.appendChild(info);

    this.collaboratorsList.appendChild(item);
    this.collaborators.set(collaborator.id, item);

    // Show container if it has collaborators
    if (this.collaborators.size > 0 && !this.isVisible) {
      this.show();
    }

    // Animate entry
    item.style.opacity = '0';
    item.style.transform = 'translateX(10px)';
    setTimeout(() => {
      item.style.transition = 'opacity 0.3s, transform 0.3s';
      item.style.opacity = '1';
      item.style.transform = 'translateX(0)';
    }, 10);
  }

  public removeCollaborator(collaboratorId: string): void {
    const item = this.collaborators.get(collaboratorId);
    if (!item) return;

    // Animate exit
    item.style.transition = 'opacity 0.3s, transform 0.3s';
    item.style.opacity = '0';
    item.style.transform = 'translateX(10px)';

    setTimeout(() => {
      item.remove();
      this.collaborators.delete(collaboratorId);

      // Hide container if no collaborators
      if (this.collaborators.size === 0) {
        this.hide();
      }
    }, 300);
  }

  public updateCollaboratorStatus(collaboratorId: string, status: 'active' | 'idle' | 'editing'): void {
    const item = this.collaborators.get(collaboratorId);
    if (!item) return;

    const statusEl = item.querySelector('.sight-edit-collaborator-status');
    if (!statusEl) return;

    const statusDot = statusEl.querySelector('span:first-child') as HTMLElement;
    const statusText = statusEl.querySelector('span:last-child') as HTMLElement;

    switch (status) {
      case 'active':
        statusDot.style.backgroundColor = '#10b981';
        statusText.textContent = 'Active';
        break;
      case 'idle':
        statusDot.style.backgroundColor = '#fbbf24';
        statusText.textContent = 'Idle';
        break;
      case 'editing':
        statusDot.style.backgroundColor = '#3b82f6';
        statusText.textContent = 'Editing';
        break;
    }
  }

  public showEditingIndicator(collaboratorId: string, elementName: string): void {
    const item = this.collaborators.get(collaboratorId);
    if (!item) return;

    this.updateCollaboratorStatus(collaboratorId, 'editing');

    // Add editing indicator
    let editingEl = item.querySelector('.sight-edit-editing-indicator') as HTMLElement;
    if (!editingEl) {
      editingEl = document.createElement('div');
      editingEl.className = 'sight-edit-editing-indicator';
      editingEl.style.cssText = `
        font-size: 11px;
        color: #3b82f6;
        margin-top: 4px;
        padding-left: 40px;
      `;
      item.appendChild(editingEl);
    }

    editingEl.textContent = `Editing: ${elementName}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      editingEl.remove();
      this.updateCollaboratorStatus(collaboratorId, 'active');
    }, 3000);
  }

  public destroy(): void {
    this.container.remove();
    this.collaborators.clear();
  }
}

/**
 * Creates cursor element for a collaborator
 */
export function createCollaboratorCursor(userId: string, color: string, name: string): HTMLElement {
  const cursor = document.createElement('div');
  cursor.id = `sight-edit-cursor-${userId}`;
  cursor.className = 'sight-edit-collaborator-cursor';
  cursor.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 10002;
    transition: left 0.1s, top 0.1s;
  `;

  // Cursor pointer
  const pointer = document.createElement('div');
  pointer.style.cssText = `
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 10px solid ${color};
    transform: rotate(-45deg);
    transform-origin: center;
  `;

  // Name label
  const label = document.createElement('div');
  label.style.cssText = `
    background: ${color};
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    margin-left: 8px;
    margin-top: -20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  label.textContent = name;

  cursor.appendChild(pointer);
  cursor.appendChild(label);

  return cursor;
}

/**
 * Creates selection highlight for a collaborator
 */
export function createCollaboratorSelection(
  userId: string,
  color: string,
  element: HTMLElement,
  start: number,
  end: number
): HTMLElement {
  const selection = document.createElement('div');
  selection.id = `sight-edit-selection-${userId}`;
  selection.className = 'sight-edit-collaborator-selection';
  selection.style.cssText = `
    position: absolute;
    background-color: ${color}33;
    border: 1px solid ${color};
    pointer-events: none;
    z-index: 9998;
  `;

  // Calculate position based on text selection
  // This is a simplified version - real implementation would need
  // to handle text nodes and ranges properly
  const rect = element.getBoundingClientRect();
  selection.style.left = `${rect.left}px`;
  selection.style.top = `${rect.top}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;

  return selection;
}