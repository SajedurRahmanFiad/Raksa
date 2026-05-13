'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toast = $('[data-toast]');

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function setYear() {
  $$('[data-year]').forEach((node) => { node.textContent = new Date().getFullYear(); });
}

function setupScrollProgress() {
  const bar = $('.scrollbar');
  if (!bar) return;
  const update = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    bar.style.width = `${(window.scrollY / max) * 100}%`;
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function setupHeader() {
  const header = $('[data-header]');
  if (!header) return;
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header.classList.toggle('is-hidden', y > 260 && y > lastY && !document.body.classList.contains('menu-open'));
    lastY = y;
  }, { passive: true });
}

function setupNav() {
  const toggle = $('[data-nav-toggle]');
  const nav = $('[data-nav]');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('a', nav).forEach((link) => {
    link.addEventListener('click', () => {
      document.body.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function setupReveal() {
  const items = $$('[data-reveal]');
  if (!items.length) return;
  if (!('IntersectionObserver' in window) || prefersReduced) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  items.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 40, 240)}ms`;
    observer.observe(item);
  });
}

function setupPointerEffects() {
  const glow = $('.cursor-glow');
  if (!glow || prefersReduced || window.innerWidth < 900) return;
  document.body.classList.add('has-pointer');
  window.addEventListener('pointermove', (event) => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  }, { passive: true });

  $$('.tilt-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${y * -5}deg) rotateY(${x * 5}deg) translateY(-2px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });

  $$('.magnetic').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      button.style.transform = `translate(${x * 0.12}px, ${y * 0.18}px)`;
    });
    button.addEventListener('pointerleave', () => {
      button.style.transform = '';
    });
  });
}

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function projectCard(project) {
  const card = textNode('article', 'project-card tilt-card');
  const img = document.createElement('img');
  img.src = project.image || '/assets/img/project-placeholder-1.svg';
  img.alt = project.title || 'RAKSA project';
  img.loading = 'lazy';
  img.addEventListener('error', () => { img.src = '/assets/img/project-placeholder-1.svg'; });
  card.appendChild(img);

  const content = textNode('div', 'project-card-content');
  const meta = textNode('div', 'project-meta');
  [project.category, project.location, project.year].filter(Boolean).forEach((item) => meta.appendChild(textNode('span', '', item)));
  content.appendChild(meta);
  content.appendChild(textNode('h3', '', project.title || 'RAKSA project'));
  content.appendChild(textNode('p', '', project.description || 'Project details will be added soon.'));
  const tags = Array.isArray(project.tags) ? project.tags : [];
  if (tags.length) {
    const row = textNode('div', 'tag-row');
    tags.forEach((tag) => row.appendChild(textNode('span', 'tag', tag)));
    content.appendChild(row);
  }
  card.appendChild(content);
  return card;
}

async function loadProjects() {
  const preview = $('[data-projects-preview]');
  const list = $('[data-projects-list]');
  if (!preview && !list) return;
  try {
    const response = await fetch('/api/projects', { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error('Projects API not available');
    const data = await response.json();
    const projects = Array.isArray(data.projects) ? data.projects : [];
    if (preview) {
      preview.textContent = '';
      projects.slice(0, 3).forEach((project) => preview.appendChild(projectCard(project)));
    }
    if (list) {
      list.textContent = '';
      projects.forEach((project) => list.appendChild(projectCard(project)));
      if (!projects.length) list.appendChild(textNode('p', '', 'No projects have been added yet.'));
    }
    setupPointerEffects();
  } catch (error) {
    const message = 'Project API is ready when the Node server is running.';
    if (preview) preview.appendChild(textNode('p', '', message));
    if (list) list.appendChild(textNode('p', '', message));
  }
}

function setupInquiryForm() {
  const form = $('#inquiryForm');
  if (!form) return;
  const status = $('[data-form-status]', form) || $('.form-status', form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    const payload = Object.fromEntries(new FormData(form).entries());
    if (button) button.disabled = true;
    if (status) {
      status.textContent = 'Sending inquiry to backend...';
      status.className = 'form-status';
    }
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const errorText = Array.isArray(data.errors) ? data.errors.join(' ') : (data.error || 'Unable to send inquiry.');
        throw new Error(errorText);
      }
      form.reset();
      if (status) {
        status.textContent = 'Inquiry saved. RAKSA can now view it in the admin backend.';
        status.classList.add('success');
      }
      showToast('Inquiry saved in backend.');
    } catch (error) {
      if (status) {
        status.textContent = `${error.message} Run node server.js and submit again.`;
        status.classList.add('error');
      }
      showToast('Backend not reachable or validation failed.');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function init() {
  setYear();
  setupScrollProgress();
  setupHeader();
  setupNav();
  setupReveal();
  setupPointerEffects();
  setupInquiryForm();
  loadProjects();
}

document.addEventListener('DOMContentLoaded', init);
