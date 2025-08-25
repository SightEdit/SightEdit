import { BaseEditor } from './base';
import { ModalManager } from '../ui/modal-manager';

export class DateModalEditor extends BaseEditor {
  private modal: ModalManager;
  private selectedDate: Date;
  private selectedTime: string = '00:00';

  constructor(element: HTMLElement, config?: any) {
    super(element, config);
    this.modal = ModalManager.getInstance();
    this.type = 'date';
  }

  render(): void {
    this.element.style.cursor = 'pointer';
    this.element.addEventListener('click', () => {
      if (!this.isEditing) {
        this.startEditing();
      }
    });
  }

  protected startEditing(): void {
    super.startEditing();
    
    // Parse current value
    const currentValue = this.extractValue();
    this.selectedDate = currentValue ? new Date(currentValue) : new Date();
    if (isNaN(this.selectedDate.getTime())) {
      this.selectedDate = new Date();
    }
    
    this.selectedTime = this.selectedDate.toTimeString().slice(0, 5);

    // Create calendar container
    const container = document.createElement('div');
    container.style.cssText = 'min-width: 350px;';

    // Date/Time toggle
    const modeToggle = document.createElement('div');
    modeToggle.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      background: #f3f4f6;
      padding: 4px;
      border-radius: 8px;
    `;

    const dateBtn = this.createModeButton('📅 Date', true);
    const timeBtn = this.createModeButton('🕐 Time', false);
    
    modeToggle.appendChild(dateBtn);
    modeToggle.appendChild(timeBtn);

    // Calendar view
    const calendarView = document.createElement('div');
    calendarView.id = 'calendar-view';
    
    // Time picker view
    const timeView = document.createElement('div');
    timeView.id = 'time-view';
    timeView.style.display = 'none';
    
    // Current selection display
    const selectionDisplay = document.createElement('div');
    selectionDisplay.style.cssText = `
      margin-top: 20px;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
      text-align: center;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
    `;

    // Assemble container
    container.appendChild(modeToggle);
    container.appendChild(calendarView);
    container.appendChild(timeView);
    container.appendChild(selectionDisplay);

    // Mode switching
    dateBtn.onclick = () => {
      dateBtn.style.background = '#3b82f6';
      dateBtn.style.color = 'white';
      timeBtn.style.background = 'transparent';
      timeBtn.style.color = '#6b7280';
      calendarView.style.display = 'block';
      timeView.style.display = 'none';
    };

    timeBtn.onclick = () => {
      timeBtn.style.background = '#3b82f6';
      timeBtn.style.color = 'white';
      dateBtn.style.background = 'transparent';
      dateBtn.style.color = '#6b7280';
      timeView.style.display = 'block';
      calendarView.style.display = 'none';
    };

    // Open modal
    const footer = this.modal.open(container, {
      title: '📅 Date & Time Picker',
      width: '400px',
      footer: true
    });

    // Initialize calendar and time picker
    setTimeout(() => {
      this.renderCalendar(calendarView);
      this.renderTimePicker(timeView);
      this.updateSelectionDisplay(selectionDisplay);
    }, 100);

    // Footer buttons
    const todayBtn = document.createElement('button');
    todayBtn.textContent = 'Today';
    todayBtn.style.cssText = `
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      margin-right: auto;
    `;
    todayBtn.onclick = () => {
      this.selectedDate = new Date();
      this.selectedTime = this.selectedDate.toTimeString().slice(0, 5);
      this.renderCalendar(calendarView);
      this.renderTimePicker(timeView);
      this.updateSelectionDisplay(selectionDisplay);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: #6b7280;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => this.stopEditing(false);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply';
    saveBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    `;
    saveBtn.onclick = () => {
      const [hours, minutes] = this.selectedTime.split(':');
      this.selectedDate.setHours(parseInt(hours), parseInt(minutes));
      this.stopEditing(true);
    };

    footer.appendChild(todayBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  private createModeButton(label: string, active: boolean): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      flex: 1;
      padding: 8px 16px;
      background: ${active ? '#3b82f6' : 'transparent'};
      color: ${active ? 'white' : '#6b7280'};
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    return btn;
  }

  private renderCalendar(container: HTMLElement): void {
    container.innerHTML = '';
    
    const year = this.selectedDate.getFullYear();
    const month = this.selectedDate.getMonth();
    
    // Month navigation
    const nav = document.createElement('div');
    nav.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    `;

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '◀';
    prevBtn.style.cssText = this.getNavButtonStyle();
    prevBtn.onclick = () => {
      this.selectedDate.setMonth(month - 1);
      this.renderCalendar(container);
      this.updateSelectionDisplay(document.querySelector('#selection-display'));
    };

    const monthLabel = document.createElement('div');
    monthLabel.textContent = `${this.getMonthName(month)} ${year}`;
    monthLabel.style.cssText = 'font-weight: 600; color: #374151;';

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '▶';
    nextBtn.style.cssText = this.getNavButtonStyle();
    nextBtn.onclick = () => {
      this.selectedDate.setMonth(month + 1);
      this.renderCalendar(container);
      this.updateSelectionDisplay(document.querySelector('#selection-display'));
    };

    nav.appendChild(prevBtn);
    nav.appendChild(monthLabel);
    nav.appendChild(nextBtn);

    // Day headers
    const dayHeaders = document.createElement('div');
    dayHeaders.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 10px;';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
      const header = document.createElement('div');
      header.textContent = day;
      header.style.cssText = 'text-align: center; font-size: 12px; font-weight: 600; color: #6b7280;';
      dayHeaders.appendChild(header);
    });

    // Calendar grid
    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      grid.appendChild(empty);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCell = document.createElement('button');
      dayCell.textContent = day.toString();
      
      const isSelected = day === this.selectedDate.getDate() && 
                        month === this.selectedDate.getMonth() && 
                        year === this.selectedDate.getFullYear();
      
      const isToday = day === today.getDate() && 
                     month === today.getMonth() && 
                     year === today.getFullYear();

      dayCell.style.cssText = `
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: ${isSelected ? '600' : '400'};
        background: ${isSelected ? '#3b82f6' : isToday ? '#dbeafe' : 'transparent'};
        color: ${isSelected ? 'white' : '#374151'};
        transition: all 0.2s;
      `;

      dayCell.onmouseover = () => {
        if (!isSelected) {
          dayCell.style.background = '#f3f4f6';
        }
      };

      dayCell.onmouseout = () => {
        if (!isSelected) {
          dayCell.style.background = isToday ? '#dbeafe' : 'transparent';
        }
      };

      dayCell.onclick = () => {
        this.selectedDate = new Date(year, month, day);
        this.renderCalendar(container);
        this.updateSelectionDisplay(document.querySelector('#selection-display'));
      };

      grid.appendChild(dayCell);
    }

    container.appendChild(nav);
    container.appendChild(dayHeaders);
    container.appendChild(grid);
  }

  private renderTimePicker(container: HTMLElement): void {
    container.innerHTML = '';

    const timeGrid = document.createElement('div');
    timeGrid.style.cssText = 'display: flex; gap: 20px; justify-content: center; align-items: center;';

    // Hours
    const hoursContainer = document.createElement('div');
    hoursContainer.style.cssText = 'text-align: center;';
    
    const hoursLabel = document.createElement('div');
    hoursLabel.textContent = 'Hours';
    hoursLabel.style.cssText = 'font-size: 12px; color: #6b7280; margin-bottom: 10px;';
    
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.min = '0';
    hoursInput.max = '23';
    hoursInput.value = this.selectedTime.split(':')[0];
    hoursInput.style.cssText = `
      width: 80px;
      padding: 15px;
      font-size: 24px;
      text-align: center;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-weight: 600;
    `;
    hoursInput.oninput = () => {
      const hours = Math.max(0, Math.min(23, parseInt(hoursInput.value) || 0));
      hoursInput.value = hours.toString().padStart(2, '0');
      this.selectedTime = `${hoursInput.value}:${this.selectedTime.split(':')[1]}`;
      this.updateSelectionDisplay(document.querySelector('#selection-display'));
    };

    hoursContainer.appendChild(hoursLabel);
    hoursContainer.appendChild(hoursInput);

    // Separator
    const separator = document.createElement('div');
    separator.textContent = ':';
    separator.style.cssText = 'font-size: 32px; font-weight: 600; color: #374151; margin-top: 20px;';

    // Minutes
    const minutesContainer = document.createElement('div');
    minutesContainer.style.cssText = 'text-align: center;';
    
    const minutesLabel = document.createElement('div');
    minutesLabel.textContent = 'Minutes';
    minutesLabel.style.cssText = 'font-size: 12px; color: #6b7280; margin-bottom: 10px;';
    
    const minutesInput = document.createElement('input');
    minutesInput.type = 'number';
    minutesInput.min = '0';
    minutesInput.max = '59';
    minutesInput.value = this.selectedTime.split(':')[1];
    minutesInput.style.cssText = `
      width: 80px;
      padding: 15px;
      font-size: 24px;
      text-align: center;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-weight: 600;
    `;
    minutesInput.oninput = () => {
      const minutes = Math.max(0, Math.min(59, parseInt(minutesInput.value) || 0));
      minutesInput.value = minutes.toString().padStart(2, '0');
      this.selectedTime = `${this.selectedTime.split(':')[0]}:${minutesInput.value}`;
      this.updateSelectionDisplay(document.querySelector('#selection-display'));
    };

    minutesContainer.appendChild(minutesLabel);
    minutesContainer.appendChild(minutesInput);

    timeGrid.appendChild(hoursContainer);
    timeGrid.appendChild(separator);
    timeGrid.appendChild(minutesContainer);

    // Quick time buttons
    const quickTimes = document.createElement('div');
    quickTimes.style.cssText = 'margin-top: 30px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;';
    
    const times = ['00:00', '06:00', '12:00', '18:00', '09:00', '15:00', '21:00', '23:59'];
    times.forEach(time => {
      const btn = document.createElement('button');
      btn.textContent = time;
      btn.style.cssText = `
        padding: 8px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: white;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      `;
      btn.onmouseover = () => {
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
      };
      btn.onmouseout = () => {
        btn.style.background = 'white';
        btn.style.color = '#374151';
      };
      btn.onclick = () => {
        this.selectedTime = time;
        hoursInput.value = time.split(':')[0];
        minutesInput.value = time.split(':')[1];
        this.updateSelectionDisplay(document.querySelector('#selection-display'));
      };
      quickTimes.appendChild(btn);
    });

    container.appendChild(timeGrid);
    container.appendChild(quickTimes);
  }

  private updateSelectionDisplay(display: HTMLElement | null): void {
    if (!display) return;
    display.id = 'selection-display';
    
    const dateStr = this.selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    display.innerHTML = `
      <div>${dateStr}</div>
      <div style="font-size: 24px; margin-top: 5px;">${this.selectedTime}</div>
    `;
  }

  private getMonthName(month: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month];
  }

  private getNavButtonStyle(): string {
    return `
      width: 32px;
      height: 32px;
      border: none;
      background: #f3f4f6;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;
      transition: all 0.2s;
    `;
  }

  protected async stopEditing(save: boolean = true): Promise<void> {
    if (save) {
      const isoString = this.selectedDate.toISOString();
      this.value = isoString;
      this.applyValue(isoString);
    }
    this.modal.close();
    await super.stopEditing(save);
  }

  extractValue(): string {
    return this.element.textContent || '';
  }

  applyValue(value: string): void {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      this.element.textContent = date.toLocaleString();
    }
  }

  destroy(): void {
    this.modal.close();
    super.destroy();
  }
}