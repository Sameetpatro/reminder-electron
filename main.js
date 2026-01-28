const { app, BrowserWindow, ipcMain, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

let mainWindow;
let reminderCheckInterval;

const dataPath = path.join(app.getPath('userData'), 'data.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'About',
      click: () => {
        mainWindow.webContents.send('show-about');
      }
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  startReminderCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  return {
    reminders: [],
    history: [],
    resumeSkills: [],
    learnedSkills: [],
    resumePath: null,
    classes: [],
    attendance: [],
    emailConfig: null
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

ipcMain.handle('load-data', () => {
  return loadData();
});

ipcMain.handle('save-reminder', (event, reminder) => {
  const data = loadData();
  reminder.id = Date.now().toString();
  reminder.createdAt = new Date().toISOString();
  reminder.status = 'pending';
  reminder.notificationsSent = [];
  data.reminders.push(reminder);
  saveData(data);
  return reminder;
});

ipcMain.handle('update-reminder-status', (event, { id, status }) => {
  const data = loadData();
  const reminder = data.reminders.find(r => r.id === id);
  if (reminder) {
    reminder.status = status;
    if (status === 'done' || status === 'cancelled') {
      data.history.push({ ...reminder, completedAt: new Date().toISOString() });
      data.reminders = data.reminders.filter(r => r.id !== id);
      
      // If done, extract skills from reminder text
      if (status === 'done') {
        extractSkillsFromReminder(data, reminder);
      }
    }
    saveData(data);
  }
  return data;
});

ipcMain.handle('delete-reminder', (event, id) => {
  const data = loadData();
  data.reminders = data.reminders.filter(r => r.id !== id);
  saveData(data);
  return data;
});

ipcMain.handle('save-resume-skills', (event, { skills, resumePath }) => {
  const data = loadData();
  data.resumeSkills = skills;
  data.resumePath = resumePath;
  saveData(data);
  return data;
});

ipcMain.handle('save-class', (event, classData) => {
  const data = loadData();
  classData.id = Date.now().toString();
  data.classes.push(classData);
  saveData(data);
  return data;
});

ipcMain.handle('delete-class', (event, id) => {
  const data = loadData();
  data.classes = data.classes.filter(c => c.id !== id);
  // Also remove attendance records for this class
  data.attendance = data.attendance.filter(a => a.classId !== id);
  saveData(data);
  return data;
});

ipcMain.handle('save-attendance', (event, attendanceRecord) => {
  const data = loadData();
  attendanceRecord.id = Date.now().toString();
  attendanceRecord.timestamp = new Date().toISOString();
  data.attendance.push(attendanceRecord);
  saveData(data);
  return data;
});

ipcMain.handle('save-email-config', (event, config) => {
  const data = loadData();
  data.emailConfig = config;
  saveData(data);
  return config;
});

// Extract technical skills from reminder text
function extractSkillsFromReminder(data, reminder) {
  const commonSkills = [
    'javascript', 'js', 'python', 'java', 'c++', 'cpp', 'c', 'c#', 'csharp',
    'react', 'reactjs', 'react.js', 'angular', 'vue', 'vuejs', 'vue.js',
    'node', 'nodejs', 'node.js', 'express', 'expressjs', 'django', 'flask',
    'spring', 'springboot', 'spring boot', 'html', 'css', 'sass', 'scss',
    'typescript', 'ts', 'sql', 'mysql', 'postgresql', 'postgres', 'mongodb',
    'redis', 'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp',
    'git', 'github', 'gitlab', 'jenkins', 'ci/cd', 'cicd',
    'machine learning', 'ml', 'deep learning', 'dl', 'ai', 'artificial intelligence',
    'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'sklearn',
    'data structures', 'algorithms', 'dsa', 'oop', 'object oriented programming',
    'rest', 'restful', 'api', 'graphql', 'websocket',
    'android', 'ios', 'swift', 'kotlin', 'flutter', 'react native',
    'unity', 'unreal', 'game development',
    'photoshop', 'illustrator', 'figma', 'sketch', 'ui/ux', 'ux/ui'
  ];

  const text = reminder.text.toLowerCase();
  const foundSkills = [];

  for (const skill of commonSkills) {
    if (text.includes(skill.toLowerCase())) {
      // Normalize the skill name
      const normalizedSkill = normalizeSkillName(skill);
      if (!foundSkills.includes(normalizedSkill)) {
        foundSkills.push(normalizedSkill);
      }
    }
  }

  // Add to learned skills if not already present
  if (!data.learnedSkills) data.learnedSkills = [];
  
  for (const skill of foundSkills) {
    if (!data.learnedSkills.includes(skill)) {
      data.learnedSkills.push(skill);
    }
  }
}

function normalizeSkillName(skill) {
  const skillMap = {
    'js': 'JavaScript',
    'javascript': 'JavaScript',
    'ts': 'TypeScript',
    'typescript': 'TypeScript',
    'reactjs': 'React',
    'react.js': 'React',
    'react': 'React',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',
    'node': 'Node.js',
    'vuejs': 'Vue.js',
    'vue.js': 'Vue.js',
    'vue': 'Vue.js',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c++': 'C++',
    'csharp': 'C#',
    'c#': 'C#',
    'html': 'HTML',
    'css': 'CSS',
    'mongodb': 'MongoDB',
    'mysql': 'MySQL',
    'postgresql': 'PostgreSQL',
    'postgres': 'PostgreSQL',
    'docker': 'Docker',
    'kubernetes': 'Kubernetes',
    'k8s': 'Kubernetes',
    'aws': 'AWS',
    'azure': 'Azure',
    'gcp': 'Google Cloud',
    'ml': 'Machine Learning',
    'machine learning': 'Machine Learning',
    'dl': 'Deep Learning',
    'deep learning': 'Deep Learning',
    'ai': 'Artificial Intelligence',
    'artificial intelligence': 'Artificial Intelligence'
  };

  return skillMap[skill.toLowerCase()] || skill.charAt(0).toUpperCase() + skill.slice(1);
}

function startReminderCheck() {
  reminderCheckInterval = setInterval(() => {
    checkReminders();
  }, 60000); // Check every minute
  checkReminders(); // Check immediately
}

function checkReminders() {
  const data = loadData();
  const now = new Date();

  data.reminders.forEach(reminder => {
    const deadline = new Date(reminder.deadline);
    const totalDuration = deadline - new Date(reminder.createdAt);
    const timeLeft = deadline - now;
    const percentPassed = ((totalDuration - timeLeft) / totalDuration) * 100;

    const isImportant = reminder.important;

    // Important reminders: 50%, 80%, 95%
    // Normal reminders: 50%, 90%

    if (isImportant) {
      // 50% notification
      if (percentPassed >= 50 && percentPassed < 51 && !reminder.notificationsSent.includes('50%')) {
        sendNotification(reminder, '50% time passed');
        reminder.notificationsSent.push('50%');
        saveData(data);
      }

      // 80% notification
      if (percentPassed >= 80 && percentPassed < 81 && !reminder.notificationsSent.includes('80%')) {
        sendNotification(reminder, '80% time passed');
        reminder.notificationsSent.push('80%');
        saveData(data);
      }

      // 95% notification
      if (percentPassed >= 95 && percentPassed < 96 && !reminder.notificationsSent.includes('95%')) {
        sendNotification(reminder, '95% time passed - Almost due!');
        reminder.notificationsSent.push('95%');
        saveData(data);
      }
    } else {
      // 50% notification
      if (percentPassed >= 50 && percentPassed < 51 && !reminder.notificationsSent.includes('50%')) {
        sendNotification(reminder, '50% time passed');
        reminder.notificationsSent.push('50%');
        saveData(data);
      }

      // 90% notification
      if (percentPassed >= 90 && percentPassed < 91 && !reminder.notificationsSent.includes('90%')) {
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        sendNotification(reminder, `${hoursLeft} hour(s) left`);
        reminder.notificationsSent.push('90%');
        saveData(data);
      }
    }

    // Deadline reached notification for all
    if (timeLeft <= 0 && !reminder.notificationsSent.includes('100%')) {
      sendNotification(reminder, 'Deadline reached!');
      reminder.notificationsSent.push('100%');
      saveData(data);
    }
  });
}

function sendNotification(reminder, message) {
  // Desktop notification
  const notification = new Notification({
    title: 'Reminder Alert',
    body: `${reminder.text}\n${message}`,
    urgency: reminder.important ? 'critical' : 'normal'
  });
  notification.show();

  // Send email if configured
  sendEmailNotification(reminder, message);
}

async function sendEmailNotification(reminder, message) {
  const data = loadData();
  if (!data.emailConfig || !data.emailConfig.enabled) return;

  try {
    const transporter = nodemailer.createTransporter({
      service: data.emailConfig.service,
      auth: {
        user: data.emailConfig.email,
        pass: data.emailConfig.password
      }
    });

    const mailOptions = {
      from: data.emailConfig.email,
      to: data.emailConfig.email,
      subject: `Reminder: ${reminder.text}`,
      html: `
        <h2>Reminder Alert</h2>
        <p><strong>${message}</strong></p>
        <p>${reminder.text}</p>
        <p>Deadline: ${new Date(reminder.deadline).toLocaleString()}</p>
        <p>Important: ${reminder.important ? 'Yes' : 'No'}</p>
        <hr>
        <p style="color: #7f8c8d; font-size: 12px;">This is an automated reminder from your Reminder App.</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Email notification sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
}