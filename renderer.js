const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let appData = {
  reminders: [],
  history: [],
  resumeSkills: [],
  learnedSkills: [],
  resumePath: null,
  classes: [],
  attendance: [],
  emailConfig: null
};

// Load data on startup
window.addEventListener('DOMContentLoaded', async () => {
  appData = await ipcRenderer.invoke('load-data');
  renderAll();
  setupEventListeners();
});

function renderAll() {
  renderReminders();
  renderHistory();
  renderSkills();
  renderClasses();
  renderAttendanceStats();
  loadEmailSettings();
}

// Navigation and Event Listeners
function setupEventListeners() {
  // Navigation
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = e.target.dataset.section;
      showSection(section);
    });
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    appData = await ipcRenderer.invoke('load-data');
    renderAll();
    showNotification('Data refreshed successfully!', 'success');
  });

  // Deadline type toggle
  document.querySelectorAll('input[name="deadline-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const deadlineInput = document.getElementById('reminder-deadline');
      const daysInput = document.getElementById('days-input');
      
      if (e.target.value === 'date') {
        deadlineInput.style.display = 'block';
        daysInput.style.display = 'none';
      } else {
        deadlineInput.style.display = 'none';
        daysInput.style.display = 'block';
      }
    });
  });

  // Reminder events
  document.getElementById('add-reminder-btn').addEventListener('click', addReminder);

  // Resume upload events
  document.getElementById('upload-resume-btn').addEventListener('click', () => {
    document.getElementById('resume-upload').click();
  });
  
  document.getElementById('resume-upload').addEventListener('change', handleResumeUpload);

  // Attendance events
  document.getElementById('show-timetable-btn').addEventListener('click', showTimetable);
  document.getElementById('add-class-btn').addEventListener('click', showAddClassForm);
  document.getElementById('mark-attendance-btn').addEventListener('click', showMarkAttendanceForm);
  
  document.getElementById('save-class-btn').addEventListener('click', saveClass);
  document.getElementById('cancel-class-btn').addEventListener('click', () => {
    document.getElementById('add-class-form').style.display = 'none';
  });

  document.getElementById('save-attendance-btn').addEventListener('click', saveAttendance);
  document.getElementById('cancel-attendance-btn').addEventListener('click', () => {
    document.getElementById('mark-attendance-form').style.display = 'none';
  });

  document.getElementById('close-timetable-btn').addEventListener('click', () => {
    document.getElementById('timetable-view').style.display = 'none';
  });

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

// Utility function to show notifications
function showNotification(message, type = 'info') {
  alert(message);
}

// ===========================
// REMINDERS SECTION
// ===========================

async function addReminder() {
  const text = document.getElementById('reminder-text').value;
  const important = document.getElementById('reminder-important').checked;
  const deadlineType = document.querySelector('input[name="deadline-type"]:checked').value;

  let deadline;
  
  if (deadlineType === 'date') {
    deadline = document.getElementById('reminder-deadline').value;
    if (!deadline) {
      alert('Please select a deadline date');
      return;
    }
  } else {
    const days = parseInt(document.getElementById('reminder-days').value);
    if (!days || days < 1) {
      alert('Please enter a valid number of days');
      return;
    }
    const deadlineDate = new Date();
    deadlineDate.setDate(deadlineDate.getDate() + days);
    deadline = deadlineDate.toISOString().slice(0, 16);
  }

  if (!text) {
    alert('Please enter a reminder text');
    return;
  }

  const reminder = {
    text,
    deadline,
    important
  };

  const newReminder = await ipcRenderer.invoke('save-reminder', reminder);
  appData.reminders.push(newReminder);

  // Clear form
  document.getElementById('reminder-text').value = '';
  document.getElementById('reminder-deadline').value = '';
  document.getElementById('reminder-days').value = '';
  document.getElementById('reminder-important').checked = false;

  renderReminders();
  showNotification('Reminder added successfully!', 'success');
}

function renderReminders() {
  const list = document.getElementById('reminders-list');
  list.innerHTML = '';

  if (appData.reminders.length === 0) {
    list.innerHTML = '<p style="color: #7f8c8d; padding: 20px; text-align: center;">No active reminders</p>';
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
      const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      timeWarning = `${daysLeft} days left`;
      warningClass = 'yellow';
    } else {
      const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      timeWarning = `${daysLeft} days left`;
    }

    item.innerHTML = `
      <div class="reminder-content">
        <h3>
          ${escapeHtml(reminder.text)}
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
  renderSkills();
  showNotification('Reminder marked as ' + status, 'success');
}

async function deleteReminder(id) {
  if (confirm('Are you sure you want to delete this reminder?')) {
    const data = await ipcRenderer.invoke('delete-reminder', id);
    appData = data;
    renderReminders();
    showNotification('Reminder deleted', 'info');
  }
}

// ===========================
// HISTORY SECTION
// ===========================

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (appData.history.length === 0) {
    list.innerHTML = '<p style="color: #7f8c8d; padding: 20px; text-align: center;">No completed reminders yet</p>';
    return;
  }

  appData.history.slice().reverse().forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';

    historyItem.innerHTML = `
      <div class="history-content">
        <h3>
          ${escapeHtml(item.text)}
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

// ===========================
// RESUME & SKILLS SECTION
// ===========================

async function handleResumeUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const allowedExtensions = ['.pdf', '.doc', '.docx'];
  const fileExtension = path.extname(file.name).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    alert('Please upload a PDF or Word document');
    return;
  }

  // Show filename
  document.getElementById('resume-filename').textContent = file.name;

  // Extract skills from resume
  const skills = await extractSkillsFromResume(file);
  
  // Save to data
  const data = await ipcRenderer.invoke('save-resume-skills', {
    skills: skills,
    resumePath: file.path
  });
  
  appData = data;
  renderSkills();
  showNotification('Resume uploaded and skills extracted!', 'success');
}

async function extractSkillsFromResume(file) {
  // Read file content
  const buffer = fs.readFileSync(file.path);
  
  // Convert to text (simplified - in production, use proper PDF/DOCX parsers)
  let text = '';
  
  if (file.name.endsWith('.pdf')) {
    // For PDF, we'd use pdf-parse or similar library
    // For now, using a simple approach
    text = buffer.toString('utf8', 0, 10000).toLowerCase();
  } else {
    // For DOCX, we'd use mammoth or similar
    text = buffer.toString('utf8', 0, 10000).toLowerCase();
  }

  // Common technical skills to look for
  const skillsDatabase = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin',
    'React', 'Angular', 'Vue.js', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'ASP.NET',
    'HTML', 'CSS', 'SASS', 'SCSS', 'Bootstrap', 'Tailwind',
    'MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'Cassandra', 'Oracle',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'GCP', 'Heroku',
    'Git', 'GitHub', 'GitLab', 'Jenkins', 'CI/CD', 'DevOps',
    'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Keras', 'Scikit-learn',
    'Data Science', 'Data Analysis', 'Pandas', 'NumPy', 'Matplotlib',
    'REST API', 'GraphQL', 'WebSocket', 'Microservices',
    'Android', 'iOS', 'Flutter', 'React Native',
    'Linux', 'Unix', 'Windows', 'MacOS',
    'Agile', 'Scrum', 'Jira', 'Trello',
    'SQL', 'NoSQL', 'Firebase',
    'Photoshop', 'Illustrator', 'Figma', 'Sketch', 'UI/UX'
  ];

  const foundSkills = [];
  
  for (const skill of skillsDatabase) {
    if (text.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  }

  return [...new Set(foundSkills)]; // Remove duplicates
}

function renderSkills() {
  // Resume skills
  const resumeSkillsList = document.getElementById('resume-skills-list');
  resumeSkillsList.innerHTML = '';
  
  if (!appData.resumeSkills || appData.resumeSkills.length === 0) {
    resumeSkillsList.innerHTML = '<p style="color: #7f8c8d; padding: 10px;">Upload your resume to extract skills</p>';
  } else {
    appData.resumeSkills.forEach(skill => {
      const tag = document.createElement('span');
      tag.className = 'skill-tag resume-skill';
      tag.textContent = skill;
      resumeSkillsList.appendChild(tag);
    });
  }

  // Learned skills
  const learnedSkillsList = document.getElementById('learned-skills-list');
  learnedSkillsList.innerHTML = '';
  
  if (!appData.learnedSkills || appData.learnedSkills.length === 0) {
    learnedSkillsList.innerHTML = '<p style="color: #7f8c8d; padding: 10px;">Complete reminders to track learned skills</p>';
  } else {
    appData.learnedSkills.forEach(skill => {
      const isNew = !appData.resumeSkills || !appData.resumeSkills.includes(skill);
      const tag = document.createElement('span');
      tag.className = isNew ? 'skill-tag new-skill' : 'skill-tag';
      tag.textContent = skill;
      tag.title = isNew ? 'New skill not in resume!' : 'Already in resume';
      learnedSkillsList.appendChild(tag);
    });
  }

  // Update stats
  document.getElementById('resume-skills-count').textContent = appData.resumeSkills ? appData.resumeSkills.length : 0;
  document.getElementById('learned-skills-count').textContent = appData.learnedSkills ? appData.learnedSkills.length : 0;
  
  const newSkills = appData.learnedSkills ? appData.learnedSkills.filter(skill => 
    !appData.resumeSkills || !appData.resumeSkills.includes(skill)
  ).length : 0;
  document.getElementById('new-skills-count').textContent = newSkills;
}

// ===========================
// ATTENDANCE SECTION
// ===========================

function showAddClassForm() {
  document.getElementById('add-class-form').style.display = 'block';
  document.getElementById('mark-attendance-form').style.display = 'none';
  document.getElementById('timetable-view').style.display = 'none';
}

function showMarkAttendanceForm() {
  document.getElementById('add-class-form').style.display = 'none';
  document.getElementById('mark-attendance-form').style.display = 'block';
  document.getElementById('timetable-view').style.display = 'none';
  
  // Populate class dropdown
  const select = document.getElementById('attendance-class');
  select.innerHTML = '<option value="">Select Class</option>';
  
  appData.classes.forEach(cls => {
    const option = document.createElement('option');
    option.value = cls.id;
    option.textContent = `${cls.name} (${cls.code})`;
    select.appendChild(option);
  });
}

function showTimetable() {
  document.getElementById('add-class-form').style.display = 'none';
  document.getElementById('mark-attendance-form').style.display = 'none';
  document.getElementById('timetable-view').style.display = 'block';
  
  renderTimetable();
}

async function saveClass() {
  const name = document.getElementById('class-name').value;
  const code = document.getElementById('class-code').value;
  const professor = document.getElementById('professor-name').value;
  const day = document.getElementById('class-day').value;
  const startTime = document.getElementById('class-start-time').value;
  const endTime = document.getElementById('class-end-time').value;

  if (!name || !code || !professor || !day || !startTime || !endTime) {
    alert('Please fill in all fields');
    return;
  }

  const classData = {
    name,
    code,
    professor,
    day,
    startTime,
    endTime
  };

  const data = await ipcRenderer.invoke('save-class', classData);
  appData = data;
  
  // Clear form
  document.getElementById('class-name').value = '';
  document.getElementById('class-code').value = '';
  document.getElementById('professor-name').value = '';
  document.getElementById('class-day').value = '';
  document.getElementById('class-start-time').value = '';
  document.getElementById('class-end-time').value = '';
  
  document.getElementById('add-class-form').style.display = 'none';
  renderClasses();
  renderAttendanceStats();
  showNotification('Class added successfully!', 'success');
}

async function saveAttendance() {
  const classId = document.getElementById('attendance-class').value;
  const date = document.getElementById('attendance-date').value;
  const status = document.getElementById('attendance-status').value;

  if (!classId || !date) {
    alert('Please fill in all fields');
    return;
  }

  const classData = appData.classes.find(c => c.id === classId);
  
  const attendanceRecord = {
    classId,
    className: classData.name,
    classCode: classData.code,
    date,
    status
  };

  const data = await ipcRenderer.invoke('save-attendance', attendanceRecord);
  appData = data;
  
  document.getElementById('mark-attendance-form').style.display = 'none';
  renderAttendanceStats();
  showNotification('Attendance marked!', 'success');
}

function renderTimetable() {
  const grid = document.getElementById('timetable-grid');
  
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const timeSlots = {};
  
  // Organize classes by day
  days.forEach(day => {
    timeSlots[day] = appData.classes.filter(cls => cls.day === day).sort((a, b) => 
      a.startTime.localeCompare(b.startTime)
    );
  });

  let tableHTML = '<table class="timetable-table"><thead><tr><th>Day</th><th>Classes</th></tr></thead><tbody>';
  
  days.forEach(day => {
    tableHTML += `<tr><td><strong>${day}</strong></td><td>`;
    
    if (timeSlots[day].length === 0) {
      tableHTML += '<em style="color: #7f8c8d;">No classes</em>';
    } else {
      timeSlots[day].forEach(cls => {
        tableHTML += `
          <div class="timetable-class">
            <div class="class-name">${cls.name} (${cls.code})</div>
            <div class="class-time">${cls.startTime} - ${cls.endTime}</div>
            <div class="professor-name">Prof. ${cls.professor}</div>
          </div>
        `;
      });
    }
    
    tableHTML += '</td></tr>';
  });
  
  tableHTML += '</tbody></table>';
  grid.innerHTML = tableHTML;
}

function renderClasses() {
  const container = document.getElementById('classes-list');
  container.innerHTML = '';

  if (appData.classes.length === 0) {
    container.innerHTML = '<p style="color: #7f8c8d; padding: 20px; text-align: center;">No classes added yet</p>';
    return;
  }

  appData.classes.forEach(cls => {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML = `
      <h4>${escapeHtml(cls.name)}</h4>
      <div class="class-code">${escapeHtml(cls.code)}</div>
      <div class="professor">Prof. ${escapeHtml(cls.professor)}</div>
      <div class="schedule">${cls.day}, ${cls.startTime} - ${cls.endTime}</div>
      <button class="btn btn-delete" onclick="deleteClass('${cls.id}')">Delete</button>
    `;
    container.appendChild(card);
  });
}

async function deleteClass(id) {
  if (confirm('Are you sure? This will also delete all attendance records for this class.')) {
    const data = await ipcRenderer.invoke('delete-class', id);
    appData = data;
    renderClasses();
    renderAttendanceStats();
    showNotification('Class deleted', 'info');
  }
}

function renderAttendanceStats() {
  const container = document.getElementById('attendance-stats-grid');
  container.innerHTML = '';

  if (appData.classes.length === 0) {
    container.innerHTML = '<p style="color: #7f8c8d; padding: 20px; text-align: center;">Add classes to track attendance</p>';
    return;
  }

  appData.classes.forEach(cls => {
    const attendanceRecords = appData.attendance.filter(a => a.classId === cls.id);
    const presentCount = attendanceRecords.filter(a => a.status === 'present').length;
    const totalCount = attendanceRecords.length;
    const percentage = totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) : 0;

    const card = document.createElement('div');
    card.className = 'class-stat-card';
    card.innerHTML = `
      <h4>${escapeHtml(cls.name)}</h4>
      <div class="professor">Prof. ${escapeHtml(cls.professor)}</div>
      <div class="attendance-bar">
        <div class="attendance-fill" style="width: ${percentage}%">${percentage}%</div>
      </div>
      <div class="attendance-details">
        <span>Present: ${presentCount}</span>
        <span>Total: ${totalCount}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ===========================
// EMAIL SETTINGS
// ===========================

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
  showNotification('Email settings saved successfully!', 'success');
}

function loadEmailSettings() {
  if (appData.emailConfig) {
    document.getElementById('email-enabled').checked = appData.emailConfig.enabled || false;
    document.getElementById('email-address').value = appData.emailConfig.email || '';
    document.getElementById('email-password').value = appData.emailConfig.password || '';
    document.getElementById('email-service').value = appData.emailConfig.service || 'gmail';
  }
}

// ===========================
// MODAL FUNCTIONS
// ===========================

function showAboutModal() {
  document.getElementById('about-modal').style.display = 'block';
}

function closeAboutModal() {
  document.getElementById('about-modal').style.display = 'none';
}

// ===========================
// UTILITY FUNCTIONS
// ===========================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions globally available
window.updateReminderStatus = updateReminderStatus;
window.deleteReminder = deleteReminder;
window.deleteClass = deleteClass;