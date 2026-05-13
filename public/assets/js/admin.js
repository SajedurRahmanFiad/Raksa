'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let inquiries = [];
let projects = [];
const toast = $('[data-toast]');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : {};
  if (!response.ok || data.ok === false) throw new Error(data.error || (Array.isArray(data.errors) ? data.errors.join(' ') : 'Request failed'));
  return data;
}

function showLogin() {
  $('[data-admin-login]').hidden = false;
  $('[data-admin-dashboard]').hidden = true;
}

function showDashboard() {
  $('[data-admin-login]').hidden = true;
  $('[data-admin-dashboard]').hidden = false;
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  catch { return iso; }
}

function renderStats() {
  const box = $('[data-admin-stats]');
  if (!box) return;
  const total = inquiries.length;
  const fresh = inquiries.filter((item) => item.status === 'new').length;
  const contacted = inquiries.filter((item) => item.status === 'contacted').length;
  const activeProjects = projects.filter((item) => item.status !== 'hidden').length;
  box.textContent = '';
  [
    ['Total inquiries', total],
    ['New', fresh],
    ['Contacted', contacted],
    ['Active projects', activeProjects]
  ].forEach(([label, value]) => {
    const card = node('article', 'admin-stat');
    card.appendChild(node('span', '', label));
    card.appendChild(node('strong', '', value));
    box.appendChild(card);
  });
}

function renderInquiries() {
  const list = $('[data-inquiries-list]');
  const search = ($('[data-inquiry-search]')?.value || '').trim().toLowerCase();
  if (!list) return;
  list.textContent = '';
  const filtered = inquiries.filter((item) => {
    const haystack = [item.name, item.company, item.phone, item.email, item.service, item.message, item.status].join(' ').toLowerCase();
    return !search || haystack.includes(search);
  });
  if (!filtered.length) {
    list.appendChild(node('p', '', 'No inquiries found.'));
    return;
  }
  filtered.forEach((item) => list.appendChild(inquiryCard(item)));
}

function inquiryCard(item) {
  const card = node('article', 'admin-card');
  const head = node('div', 'admin-card-head');
  const left = node('div');
  left.appendChild(node('h3', '', item.name || 'Unnamed inquiry'));
  left.appendChild(node('small', '', `${formatDate(item.createdAt)} | ${item.service || 'General request'}`));
  const badge = node('span', `badge ${item.status || 'new'}`, item.status || 'new');
  head.append(left, badge);
  card.appendChild(head);

  const details = node('p');
  details.textContent = [item.company, item.phone, item.email].filter(Boolean).join(' | ');
  card.appendChild(details);
  card.appendChild(node('p', '', item.message || 'No message'));

  const tools = node('div', 'card-tools');
  const status = document.createElement('select');
  ['new', 'contacted', 'quoted', 'closed'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = (item.status || 'new') === value;
    status.appendChild(option);
  });
  const note = document.createElement('input');
  note.placeholder = 'Admin note';
  note.value = item.note || '';
  const save = node('button', 'btn btn-primary', 'Save');
  save.type = 'button';
  const del = node('button', 'btn btn-secondary', 'Delete');
  del.type = 'button';
  const call = node('a', 'btn btn-secondary', 'Call');
  call.href = item.phone ? `tel:${item.phone}` : '#';
  const mail = node('a', 'btn btn-secondary', 'Email');
  mail.href = item.email ? `mailto:${item.email}` : '#';
  tools.append(status, note, save, call, mail, del);
  card.appendChild(tools);

  save.addEventListener('click', async () => {
    try {
      const data = await api(`/api/admin/inquiries/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { status: status.value, note: note.value } });
      const index = inquiries.findIndex((entry) => entry.id === item.id);
      if (index >= 0) inquiries[index] = data.inquiry;
      renderInquiries();
      renderStats();
      showToast('Inquiry updated.');
    } catch (error) { showToast(error.message); }
  });
  del.addEventListener('click', async () => {
    if (!confirm('Delete this inquiry?')) return;
    try {
      await api(`/api/admin/inquiries/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      inquiries = inquiries.filter((entry) => entry.id !== item.id);
      renderInquiries();
      renderStats();
      showToast('Inquiry deleted.');
    } catch (error) { showToast(error.message); }
  });
  return card;
}

function renderProjects() {
  const list = $('[data-projects-admin-list]');
  if (!list) return;
  list.textContent = '';
  if (!projects.length) {
    list.appendChild(node('p', '', 'No projects found.'));
    return;
  }
  projects.forEach((project) => {
    const card = node('article', 'admin-card');
    const head = node('div', 'admin-card-head');
    const left = node('div');
    left.appendChild(node('h3', '', project.title || 'Untitled project'));
    left.appendChild(node('small', '', [project.category, project.location, project.year].filter(Boolean).join(' | ')));
    head.appendChild(left);
    head.appendChild(node('span', `badge ${project.status === 'hidden' ? 'closed' : 'new'}`, project.status || 'active'));
    card.appendChild(head);
    card.appendChild(node('p', '', project.description || 'No description'));
    card.appendChild(node('small', '', `Image: ${project.image || 'none'}`));
    const tools = node('div', 'card-tools');
    const edit = node('button', 'btn btn-primary', 'Edit');
    edit.type = 'button';
    const del = node('button', 'btn btn-secondary', 'Delete');
    del.type = 'button';
    tools.append(edit, del);
    card.appendChild(tools);
    edit.addEventListener('click', () => fillProjectForm(project));
    del.addEventListener('click', async () => {
      if (!confirm('Delete this project?')) return;
      try {
        await api(`/api/admin/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
        projects = projects.filter((entry) => entry.id !== project.id);
        renderProjects();
        renderStats();
        showToast('Project deleted.');
      } catch (error) { showToast(error.message); }
    });
    list.appendChild(card);
  });
}

function fillProjectForm(project) {
  const form = $('#projectForm');
  if (!form) return;
  form.id.value = project.id || '';
  form.title.value = project.title || '';
  form.location.value = project.location || '';
  form.category.value = project.category || '';
  form.year.value = project.year || '';
  form.image.value = project.image || '';
  form.description.value = project.description || '';
  form.tags.value = Array.isArray(project.tags) ? project.tags.join(', ') : '';
  form.status.value = project.status || 'active';
  form.featured.checked = Boolean(project.featured);
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetProjectForm() {
  const form = $('#projectForm');
  if (!form) return;
  form.reset();
  form.id.value = '';
  form.status.value = 'active';
}

async function loadAdminData() {
  const inquiryData = await api('/api/admin/inquiries');
  const projectData = await api('/api/admin/projects');
  inquiries = inquiryData.inquiries || [];
  projects = projectData.projects || [];
  renderStats();
  renderInquiries();
  renderProjects();
}

function setupLogin() {
  const form = $('#loginForm');
  if (!form) return;
  const status = $('[data-login-status]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (status) status.textContent = 'Checking password...';
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: form.password.value } });
      form.reset();
      showDashboard();
      await loadAdminData();
      showToast('Logged in.');
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

function setupTabs() {
  $$('[data-tab-button]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-tab-button');
      $$('[data-tab-button]').forEach((item) => item.classList.toggle('active', item === button));
      $$('[data-tab-panel]').forEach((panel) => panel.classList.toggle('active', panel.getAttribute('data-tab-panel') === tab));
    });
  });
}

function setupProjectForm() {
  const form = $('#projectForm');
  if (!form) return;
  const status = $('[data-project-status]');
  $('[data-project-reset]')?.addEventListener('click', resetProjectForm);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.featured = form.featured.checked;
    payload.tags = payload.tags || '';
    const id = payload.id;
    delete payload.id;
    try {
      const data = id
        ? await api(`/api/admin/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload })
        : await api('/api/admin/projects', { method: 'POST', body: payload });
      const index = projects.findIndex((entry) => entry.id === data.project.id);
      if (index >= 0) projects[index] = data.project;
      else projects.unshift(data.project);
      renderProjects();
      renderStats();
      resetProjectForm();
      if (status) {
        status.textContent = 'Project saved.';
        status.className = 'form-status success';
      }
      showToast('Project saved.');
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.className = 'form-status error';
      }
    }
  });
}

function setupControls() {
  $('[data-inquiry-search]')?.addEventListener('input', renderInquiries);
  $('[data-logout]')?.addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
    showLogin();
  });
}

async function init() {
  setupLogin();
  setupTabs();
  setupProjectForm();
  setupControls();
  try {
    await api('/api/admin/me');
    showDashboard();
    await loadAdminData();
  } catch {
    showLogin();
  }
}

document.addEventListener('DOMContentLoaded', init);
