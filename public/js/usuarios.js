// =============================================================================
// Usuários (só super admin): criação, edição de nome, e-mail e perfil,
// redefinição de senha e exclusão.
//   GET /api/users   POST /api/users   PATCH /api/users/:id   DELETE /api/users/:id
// O usuário logado aparece como "Você": edita o próprio nome e e-mail, mas não
// troca o próprio perfil nem exclui a própria conta. A conta raiz só tem
// "Redefinir senha", e só para ela mesma. O back-end recusa o resto de qualquer forma.
// =============================================================================
import { api } from './api.js';
import { validateEmail, validateName, validatePassword } from './auth.js';
import { initPage, roleLabel, roleTags, startAutoRefresh } from './layout.js';
import {
    clearFieldErrors, closeModal, confirmDialog, el, formatDateTime, hideFormMessage, iconButton, setBusy, setFieldError,
    setText, showError, showFieldErrors, showFormMessage, syncBadges, syncChildren, tableShell, toast,
} from './ui.js';

const me = await initPage('usuarios', { superAdminOnly: true });

const { wrapper, tbody, row } = tableShell(['Nome', 'E-mail', 'Perfil', 'Cadastro', { label: 'Ações', className: 'text-end' }], { caption: 'Usuários do sistema' });
document.getElementById('userList').append(wrapper);

// ---- Desenho -----------------------------------------------------------------

/** Botões da linha: a raiz só troca a própria senha; a própria conta não troca o perfil nem se exclui. */
function rowActions(user, isMe) {
    const resetPassword = iconButton('bi-key', `Redefinir a senha de ${user.name}`, () => openPasswordForm(user));
    if (user.isRoot) return isMe ? [resetPassword] : [];
    return [
        iconButton('bi-pencil', `Editar ${user.name}`, () => openUserForm(user)),
        isMe ? null : iconButton('bi-person-gear', `Trocar o perfil de ${user.name}`, () => openUserForm(user, { roleOnly: true })),
        resetPassword,
        isMe ? null : iconButton('bi-trash', `Excluir ${user.name}`, (b) => removeUser(user, b), { danger: true }),
    ].filter(Boolean);
}

function userRow(user) {
    const isMe = user.id === me.id;
    return row([
        el('td', { className: 'cell-title' }, [
            el('div', { className: 'd-flex align-items-center gap-3' }, [
                el('span', { className: 'icon-box icon-box-sm tone-primary', attrs: { 'aria-hidden': 'true' } }, [el('i', { className: 'bi bi-person' })]),
                el('span', { className: 'device-name' }, [user.name, isMe ? el('span', { className: 'tag ms-2', text: 'Você' }) : null]),
            ]),
        ]),
        el('td', { className: 'mono', text: user.email }),
        el('td', {}, [el('div', { className: 'd-flex flex-wrap gap-1' }, roleTags(user))]),
        el('td', { className: 'mono', text: formatDateTime(user.createdAt) }),
        el('td', { className: 'cell-actions text-end' }, [el('div', { className: 'row-actions', attrs: { role: 'group', 'aria-label': `Ações de ${user.name}` } }, rowActions(user, isMe))]),
    ]);
}

function render(users) {
    const count = (role) => users.filter((u) => u.role === role).length;
    syncBadges(document.getElementById('roleBadges'), [
        { key: 'superadmin', tone: 'accent', text: `${count('superadmin')} super admin(s)` },
        { key: 'admin', tone: 'primary', text: `${count('admin')} admin(s)` },
        { key: 'viewer', tone: 'neutral', text: `${count('viewer')} usuário(s)` },
    ]);
    setText(document.getElementById('userCount'), `${users.length} conta(s)`);
    syncChildren(tbody, users, (u) => u.id, userRow);
}

async function load() {
    const { users } = await api('GET', '/users');
    render(users);
    document.getElementById('userState').replaceChildren(); // some o esqueleto de carregamento
}

const poller = startAutoRefresh({ load, area: document.getElementById('userState'), statusEl: document.getElementById('updateStatus') });

// ---- Ações ----------------------------------------------------------------------

async function removeUser(user, button) {
    const confirmed = await confirmDialog({
        title: 'Excluir usuário',
        message: `Excluir a conta de ${user.name} (${user.email})? A pessoa perde o acesso na hora. Os alertas que ela reconheceu continuam registrados, como "usuário removido".`,
        confirmText: 'Excluir',
        danger: true,
    });
    if (!confirmed) return;
    button.disabled = true;
    try {
        await api('DELETE', `/users/${user.id}`);
        toast(`A conta de ${user.name} foi excluída.`);
        poller.refresh();
    } catch (err) {
        showError(err);
        button.disabled = false;
    }
}

// ---- Modal de criação e edição de conta ---------------------------------------------

const userModalElement = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
const userFormMessage = document.getElementById('userFormMessage');
const userSaveButton = document.getElementById('userSaveButton');
const userModal = new window.bootstrap.Modal(userModalElement);
const userField = (name) => userForm.elements.namedItem(name);
const passwordFields = document.getElementById('uPasswordFields');
let editing = null; // usuário em edição; null quando é uma conta nova
let firstField = 'name'; // campo que recebe o foco ao abrir

/**
 * Abre o modal vazio (conta nova) ou preenchido com o usuário a editar.
 * Com roleOnly (botão "Trocar perfil"), o foco já vai para o seletor de perfil.
 */
function openUserForm(user = null, { roleOnly = false } = {}) {
    editing = user;
    firstField = roleOnly ? 'role' : 'name';
    userForm.reset();
    clearFieldErrors(userForm);
    hideFormMessage(userFormMessage);
    const isMe = user?.id === me.id;
    const title = !user ? 'Novo usuário' : roleOnly ? `Trocar o perfil de ${user.name}` : `Editar ${user.name}`;
    setText(document.getElementById('userModalTitle'), title);
    passwordFields.hidden = Boolean(user);
    for (const name of ['password', 'confirmPassword']) userField(name).disabled = Boolean(user);
    userField('name').value = user?.name ?? '';
    userField('email').value = user?.email ?? '';
    userField('role').value = user?.role ?? 'viewer';
    userField('role').disabled = isMe;
    setText(document.getElementById('uRoleHelp'), isMe ? 'Você não pode alterar o perfil da própria conta.' : '');
    userModal.show();
}

document.getElementById('newUserButton').addEventListener('click', () => openUserForm());
userModalElement.addEventListener('shown.bs.modal', () => userField(firstField).focus());

/** Só os campos que mudaram em relação ao usuário em edição. */
function changedFields(values) {
    const changes = {};
    if (values.name !== editing.name) changes.name = values.name;
    if (values.email !== editing.email) changes.email = values.email;
    if (!userField('role').disabled && values.role !== editing.role) changes.role = values.role;
    return changes;
}

userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(userForm);
    hideFormMessage(userFormMessage);

    const values = {
        name: userField('name').value.trim(),
        email: userField('email').value.trim().toLowerCase(),
        role: userField('role').value,
    };
    const password = userField('password').value;
    const errors = {
        name: validateName(values.name),
        email: validateEmail(values.email),
        ...(editing ? {} : {
            password: validatePassword(password),
            confirmPassword: password !== userField('confirmPassword').value ? 'As senhas não são iguais.' : null,
        }),
    };
    for (const [name, message] of Object.entries(errors)) if (message) setFieldError(userField(name), message);
    const firstInvalid = userForm.querySelector('.is-invalid');
    if (firstInvalid) {
        firstInvalid.focus();
        return;
    }

    const body = editing ? changedFields(values) : { ...values, password };
    if (!Object.keys(body).length) {
        showFormMessage(userFormMessage, 'Nenhum campo foi alterado.', 'warning');
        return;
    }

    setBusy(userSaveButton, true, 'Salvando...');
    try {
        const { user } = editing
            ? await api('PATCH', `/users/${editing.id}`, body)
            : await api('POST', '/users', body);
        closeModal(userModalElement);
        if (!editing) toast(`Conta de ${user.name} criada.`);
        else if (Object.keys(body).join() === 'role') toast(`${user.name} agora é ${roleLabel(user.role)}.`);
        else toast(`Conta de ${user.name} atualizada.`);
        poller.refresh();
    } catch (err) {
        if (err.status === 400 && showFieldErrors(userForm, err.details)) {
            userForm.querySelector('.is-invalid')?.focus();
        } else if (err.status === 409 && err.details?.fields?.includes('email')) {
            setFieldError(userField('email'), err.message); // "Já existe uma conta com este e-mail."
            userField('email').focus();
        } else if (err.status === 403) {
            showError(err);
        } else {
            showFormMessage(userFormMessage, err.message); // ex.: 409 ao rebaixar a própria conta
        }
    } finally {
        setBusy(userSaveButton, false);
    }
});

// ---- Modal de redefinição de senha ------------------------------------------------

const modalElement = document.getElementById('passwordModal');
const form = document.getElementById('passwordForm');
const formMessage = document.getElementById('passwordFormMessage');
const saveButton = document.getElementById('passwordSaveButton');
const modal = new window.bootstrap.Modal(modalElement);
const field = (name) => form.elements.namedItem(name);
let target = null; // usuário cuja senha está sendo redefinida

function openPasswordForm(user) {
    target = user;
    form.reset();
    clearFieldErrors(form);
    hideFormMessage(formMessage);
    setText(document.getElementById('passwordModalTitle'), user.id === me.id ? 'Redefinir a sua senha' : `Redefinir a senha de ${user.name}`);
    modal.show();
}

modalElement.addEventListener('shown.bs.modal', () => field('password').focus());

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    hideFormMessage(formMessage);

    const password = field('password').value;
    const errors = {
        password: validatePassword(password),
        confirmPassword: password !== field('confirmPassword').value ? 'As senhas não são iguais.' : null,
    };
    for (const [name, message] of Object.entries(errors)) if (message) setFieldError(field(name), message);
    const firstInvalid = form.querySelector('.is-invalid');
    if (firstInvalid) {
        firstInvalid.focus();
        return;
    }

    setBusy(saveButton, true, 'Salvando...');
    try {
        await api('PATCH', `/users/${target.id}`, { password });
        closeModal(modalElement);
        toast(`Senha de ${target.name} redefinida.`);
    } catch (err) {
        if (err.status === 400 && showFieldErrors(form, err.details)) form.querySelector('.is-invalid')?.focus();
        else if (err.status === 403) showError(err);
        else showFormMessage(formMessage, err.message);
    } finally {
        setBusy(saveButton, false);
    }
});
