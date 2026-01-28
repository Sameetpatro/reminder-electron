const { ipcRenderer } = require('electron');

let appData = {
  reminders: [],
  history: [],
  skills: [],
  schedule: [],
  subjects: [],
  attendance: [],
  emailConfig: null
};

// Load data on startup
window.addEventListener('DOMContentLoaded', async () => {
  appData = await ipcRenderer.invoke('load-data');
  renderReminders();
  renderHistory();
  renderSkills();
  renderSchedule();
  renderSubjects();
  renderAttendanceStats();
  loadEmailSettings();
  setupEventListeners();
});

// Navigation
function setupEventListeners() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.dataset.section;
      showSection(section);
    });
  });

  // Reminder events
  document.getElementById('add-reminder-btn').addEventListener('click', addReminder);

  // Skill events
  document.getElementById('add-skill-btn').addEventListener('click', addSkill);

  // Schedule events
  document.getElementById('add-schedule-item-btn').addEventListener('click', addScheduleItem);
  document.getElementById('save-schedule-btn').addEventListener('click', saveSchedule);

  // Subject events
  document.getElementById('add-subject-btn').addEventListener('click', addSubject);

  // Attendance events
  document.getElementById('mark-attendance-btn').addEventListener('click', markAttendance);

  // Email settings
  document.getElementById('save-email-btn').addEventListener('click', saveEmailSettings);

  // Modal events
  ipcRenderer.on('show-about', showAboutModal);
  document.querySelector('.close').addEventListener('click', closeAboutModal);
  window.addEventListener('click', (e) => {
    const modal = document.getElementById('about-modal');
    if (e.target === modal) {
      closeAboutModal();
    }
  });

  // Set today's date for attendance
  document.getElementById('attendance-date').valueAsDate = new Date();
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });

  document.getElementById(sectionId).classList.add('active');
  document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
}

// Reminders
async function addReminder() {
  const text = document.getElementById('reminder-text').value;
  const deadline = document.getElementById('reminder-deadline').value;
  const important = document.getElementById('reminder-important').checked;

  if (!text || !deadline) {
    alert('Please fill in all fields');
    return;
  }

  const reminder = {
    text,
    deadline,
    important
  };

  const newReminder = await ipcRenderer.invoke('save-reminder', reminder);
  appData.reminders.push(newReminder);

  document.getElementById('reminder-text').value = '';
  document.getElementById('reminder-deadline').value = '';
  document.getElementById('reminder-important').checked = false;

  renderReminders();
}

function renderReminders() {
  const list = document.getElementById('reminders-list');
  list.innerHTML = '';

  if (appData.reminders.length === 0) {
    list.innerHTML = '<p style="color: #7f8c8d; padding: 20px;">No active reminders</p>';
    return;
  }

  appData.reminders.forEach(reminder => {
    const item = document.createElement('div');
    item.className = `reminder-item ${reminder.important ? 'important' : ''}`;

    const now = new Date();
    const deadline = new Date(reminder.deadline);
    const createdAt = new Date(reminder.createdAt);
    const totalDuration = deadline - createdAt;
    const timeLeft = deadline - now;
    const percentPassed = ((totalDuration - timeLeft) / totalDuration) * 100;

    let timeWarning = '';
    let warningClass = 'green';
    
    if (timeLeft < 0) {
      timeWarning = 'OVERDUE!';
      warningClass = 'red';
    } else if (percentPassed >= 90) {
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      timeWarning = `${hoursLeft}h left`;
      warningClass = 'red';
    } else if (percentPassed >= 50) {
      timeWarning = '50% time passed';
      warningClass = 'yellow';
    } else {
      const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      timeWarning = `${daysLeft} days left`;
    }

    item.innerHTML = `
      <div class="reminder-content">
        <h3>
          ${reminder.text}
          ${reminder.important ? '<span class="badge important">IMPORTANT</span>' : ''}
        </h3>
        <p>Deadline: ${new Date(reminder.deadline).toLocaleString()}</p>
        <span class="time-warning ${warningClass}">${timeWarning}</span>
      </div>
      <div class="reminder-actions">
        <button class="btn btn-done" onclick="updateReminderStatus('${reminder.id}', 'done')">Done</button>
        <button class="btn btn-delete" onclick="deleteReminder('${reminder.id}')">Delete</button>
      </div>
    `;

    list.appendChild(item);
  });
}

async function updateReminderStatus(id, status) {
  const data = await ipcRenderer.invoke('update-reminder-status', { id, status });
  appData = data;
  renderReminders();
  renderHistory();
}

async function deleteReminder(id) {
  if (confirm('Are you sure you want to delete this reminder?')) {
    const data = await ipcRenderer.invoke('delete-reminder', id);
    appData = data;
    renderReminders();
  }
}

// History
function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (appData.history.length === 0) {
    list.innerHTML = '<p style="color: #7f8c8d; padding: 20px;">No completed reminders yet</p>';
    return;
  }

  appData.history.slice().reverse().forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    historyItem.innerHTML = `
      <div class="history-content">
        <h3>
          ${item.text}
          <span class="badge ${item.status}">${item.status.toUpperCase()}</span>
          ${item.important ? '<span class="badge important">IMPORTANT</span>' : ''}
        </h3>
        <p>Deadline: ${new Date(item.deadline).toLocaleString()}</p>
        <p>Completed: ${new Date(item.completedAt).toLocaleString()}</p>
      </div>
    `;

    list.appendChild(historyItem);
  });
}

// Skills
async function addSkill() {
  const name = document.getElementById('skill-name').value;
  const level = document.getElementById('skill-level').value;

  if (!name) {
    alert('Please enter a skill name');
    return;
  }

  const skill = { name, level };
  const newSkill = await ipcRenderer.invoke('save-skill', skill);
  appData.skills.push(newSkill);

  document.getElementById('skill-name').value = '';
  renderSkills();
}

function renderSkills() {
  const list = document.getElementById('skills-list');
  list.innerHTML = '';

  if (appData.skills.length === 0) {
    list.innerHTML = '<p style="color: #7f8c8d; padding: 20px;">No skills tracked yet</p>';
    return;
  }

  appData.skills.forEach(skill => {
    const item = document.createElement('div');
    item.className = 'skill-item';

    item.innerHTML = `
      <div class="skill-content">
        <h3>${skill.name}</h3>
        <p>Added: ${new Date(skill.addedAt).toLocaleDateString()}</p>
      </div>
      <div class="skill-actions">
        <span class="skill-level ${skill.level}">${skill.level}</span>
        <button class="btn btn-delete" onclick="deleteSkill('${skill.id}')">Delete</button>
      </div>
    `;

    list.appendChild(item);
  });
}

async function deleteSkill(id) {
  if (confirm('Are you sure you want to delete this skill?')) {
    const data = await ipcRenderer.invoke('delete-skill', id);
    appData = data;
    renderSkills();
  }
}

// Schedule
function addScheduleItem() {
  const container = document.getElementById('schedule-items');
  const item = document.createElement('div');
  item.className = 'schedule-item';
  item.innerHTML = `
    <input type="time" class="schedule-time" value="08:00" />
    <input type="text" class="schedule-activity" placeholder="Activity" />
    <button onclick="this.parentElement.remove()">Remove</button>
  `;
  container.appendChild(item);
}

async function saveSchedule() {
  const items = [];
  document.querySelectorAll('.schedule-item').forEach(item => {
    const time = item.querySelector('.schedule-time').value;
    const activity = item.querySelector('.schedule-activity').value;
    if (time && activity) {
      items.push({ time, activity });
    }
  });

  items.sort((a, b) => a.time.localeCompare(b.time));
  const data = await ipcRenderer.invoke('save-schedule', items);
  appData = data;
  alert('Schedule saved successfully!');
}

function renderSchedule() {
  const container = document.getElementById('schedule-items');
  container.innerHTML = '';

  if (appData.schedule.length === 0) {
    addScheduleItem();
    return;
  }

  appData.schedule.forEach(item => {
    const scheduleItem = document.createElement('div');
    scheduleItem.className = 'schedule-item';
    scheduleItem.innerHTML = `
      <input type="time" class="schedule-time" value="${item.time}" />
      <input type="text" class="schedule-activity" value="${item.activity}" />
      <button onclick="this.parentElement.remove()">Remove</button>
    `;
    container.appendChild(scheduleItem);
  });
}

// Subjects
async function addSubject() {
  const name = document.getElementById('subject-name').value;

  if (!name) {
    alert('Please enter a subject name');
    return;
  }

  if (!appData.subjects) appData.subjects = [];
  
  const subject = {
    id: Date.now().toString(),
    name
  };

  appData.subjects.push(subject);
  await ipcRenderer.invoke('save-subjects', appData.subjects);

  document.getElementById('subject-name').value = '';
  renderSubjects();
  updateAttendanceSubjectSelect();
}

function renderSubjects() {
  const container = document.getElementById('subjects-list');
  container.innerHTML = '';

  if (!appData.subjects || appData.subjects.length === 0) {
    container.innerHTML = '<p style="color: #7f8c8d; padding: 20px;">No subjects added yet</p>';
    return;
  }

  appData.subjects.forEach(subject => {
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.innerHTML = `
      <h4>${subject.name}</h4>
      <button class="btn btn-delete" onclick="deleteSubject('${subject.id}')">Delete</button>
    `;
    container.appendChild(card);
  });

  updateAttendanceSubjectSelect();
}

async function deleteSubject(id) {
  if (confirm('Are you sure you want to delete this subject?')) {
    appData.subjects = appData.subjects.filter(s => s.id !== id);
    await ipcRenderer.invoke('save-subjects', appData.subjects);
    renderSubjects();
  }
}

function updateAttendanceSubjectSelect() {
  const select = document.getElementById('attendance-subject');
  select.innerHTML = '';

  if (!appData.subjects || appData.subjects.length === 0) {
    select.innerHTML = '<option>Add subjects first</option>';
    return;
  }

  appData.subjects.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.name;
    select.appendChild(option);
  });
}

// Attendance
async function markAttendance() {
  const subjectId = document.getElementById('attendance-subject').value;
  const day = document.getElementById('attendance-day').value;
  const date = document.getElementById('attendance-date').value;

  if (!subjectId || !day || !date) {
    alert('Please fill in all fields');
    return;
  }

  const subject = appData.subjects.find(s => s.id === subjectId);
  if (!subject) {
    alert('Subject not found');
    return;
  }

  const record = {
    subjectId,
    subjectName: subject.name,
    day,
    date
  };

  const data = await ipcRenderer.invoke('mark-attendance', record);
  appData = data;
  renderAttendanceStats();
}

function renderAttendanceStats() {
  const container = document.getElementById('attendance-stats');
  container.innerHTML = '<h3>Attendance Statistics</h3>';

  if (!appData.attendance || appData.attendance.length === 0) {
    container.innerHTML += '<p style="color: #7f8c8d;">No attendance records yet</p>';
    return;
  }

  const stats = {};
  appData.subjects.forEach(subject => {
    const count = appData.attendance.filter(a => a.subjectId === subject.id).length;
    stats[subject.name] = count;
  });

  Object.keys(stats).forEach(subjectName => {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `
      <span><strong>${subjectName}</strong></span>
      <span>${stats[subjectName]} classes attended</span>
    `;
    container.appendChild(row);
  });


  const recent = document.createElement('div');
  recent.style.marginTop = '20px';
  recent.innerHTML = '<h4>Recent Attendance</h4>';
  
  appData.attendance.slice(-10).reverse().forEach(record => {
    const entry = document.createElement('div');
    entry.className = 'stat-row';
    entry.innerHTML = `
      <span>${record.subjectName} - ${record.day}</span>
      <span>${new Date(record.date).toLocaleDateString()}</span>
    `;
    recent.appendChild(entry);
  });
  
  container.appendChild(recent);
}

// Email Settings
async function saveEmailSettings() {
  const enabled = document.getElementById('email-enabled').checked;
  const email = document.getElementById('email-address').value;
  const password = document.getElementById('email-password').value;
  const service = document.getElementById('email-service').value;

  if (enabled && (!email || !password)) {
    alert('Please enter email and password');
    return;
  }

  const config = {
    enabled,
    email,
    password,
    service
  };

  await ipcRenderer.invoke('save-email-config', config);
  appData.emailConfig = config;
  alert('Email settings saved successfully!');
}

function loadEmailSettings() {
  if (appData.emailConfig) {
    document.getElementById('email-enabled').checked = appData.emailConfig.enabled || false;
    document.getElementById('email-address').value = appData.emailConfig.email || '';
    document.getElementById('email-password').value = appData.emailConfig.password || '';
    document.getElementById('email-service').value = appData.emailConfig.service || 'gmail';
  }
}

// About Modal
function showAboutModal() {
  document.getElementById('about-modal').style.display = 'block';
}

function closeAboutModal() {
  document.getElementById('about-modal').style.display = 'none';
}

// Make functions globally available
window.updateReminderStatus = updateReminderStatus;
window.deleteReminder = deleteReminder;
window.deleteSkill = deleteSkill;
window.deleteSubject = deleteSubject;