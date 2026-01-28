const { app, BrowserWindow, ipcMain, Notification, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

let mainWindow;
let reminderCheckInterval;

const dataPath = path.join(app.getPath('userData'), 'data.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
    skills: [],
    schedule: [],
    subjects: [],
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

ipcMain.handle('save-skill', (event, skill) => {
  const data = loadData();
  skill.id = Date.now().toString();
  skill.addedAt = new Date().toISOString();
  data.skills.push(skill);
  saveData(data);
  return skill;
});

ipcMain.handle('delete-skill', (event, id) => {
  const data = loadData();
  data.skills = data.skills.filter(s => s.id !== id);
  saveData(data);
  return data;
});

ipcMain.handle('save-schedule', (event, scheduleItems) => {
  const data = loadData();
  data.schedule = scheduleItems;
  saveData(data);
  return data;
});

ipcMain.handle('save-subjects', (event, subjects) => {
  const data = loadData();
  data.subjects = subjects;
  saveData(data);
  return data;
});

ipcMain.handle('mark-attendance', (event, attendanceRecord) => {
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

    // Check for 50% warning
    if (percentPassed >= 50 && !reminder.notificationsSent.includes('50%')) {
      sendNotification(reminder, '50% time passed');
      reminder.notificationsSent.push('50%');
      saveData(data);
    }

    // Check for 90% warning (1 hour left for short tasks, 6 hours for long)
    if (percentPassed >= 90 && !reminder.notificationsSent.includes('90%')) {
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
      sendNotification(reminder, `${hoursLeft} hour(s) left`);
      reminder.notificationsSent.push('90%');
      saveData(data);
    }

    // Check for deadline
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
    const transporter = nodemailer.createTransport({
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
        <p>Mark as done: <a href="reminder://done/${reminder.id}">Done</a></p>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}