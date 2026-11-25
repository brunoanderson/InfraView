// =============================================================================
// Usuários (só admin): criação, edição de nome, e-mail e perfil, redefinição de
// senha e exclusão.
//   GET /api/users   POST /api/users   PATCH /api/users/:id   DELETE /api/users/:id
// O usuário logado aparece como "Você": edita o próprio nome e e-mail, mas não
// tem as ações de perfil e exclusão (o back-end recusa com 409 de qualquer forma).
// =============================================================================
import { api } from './api.js';
import { validateEmail, validateName, validatePassword } from './auth.js';
import { initPage, startAutoRefresh } from './layout.js';
import {
    clearFieldErrors, closeModal, confirmDialog, el, formatDateTime, hideFormMessage, iconButton, setBusy, setFieldError,
    setText, showError, showFieldErrors, showFormMessage, syncBadges, syncChildren, tableShell, toast,
} from './ui.js';

const me = await initPage('usuarios', { adminOnly: true });

const ROLES = {
    admin: { label: 'Admin', tagClass: 'tag tag-accent' },
    viewer: { label: 'Visualizador', tagClass: 'tag' },
};

const { wrapper, tbody, row } = tableShell(['Nome', 'E-mail', 'Perfil', 'Cadastro', { label: 'Ações', className: 'text-end' }], { caption: 'Usuários do sistema' });
document.getElementById('userList').append(wrapper);

// ---- Desenho -----------------------------------------------------------------

function userRow(user) {
    const isMe = user.id === me.id;
    const actions = [iconButton('bi-key', `Redefinir a senha de ${user.name}`, () => openPasswordForm(user))];
    if (!isMe) {
        const promote = user.role === 'viewer';
        actions.unshift(iconButton(promote ? 'bi-arrow-up-circle' : 'bi-arrow-down-circle',
            promote ? `Tornar ${user.name} administrador` : `Tornar ${user.name} visualizador`, (b) => changeRole(user, b)));
        actions.push(iconButton('bi-trash', `Excluir ${user.name}`, (b) => removeUser(user, b), { danger: true }));
    }
    actions.unshift(iconButton('bi-pencil', `Editar ${user.name}`, () => openUserForm(user)));
    return row([
        el('td', { className: 'cell-title' }, [
            el('div', { className: 'd-flex align-items-center gap-3' }, [
                el('span', { className: 'icon-box icon-box-sm tone-primary', attrs: { 'aria-hidden': 'true' } }, [el('i', { className: 'bi bi-person' })]),
                el('span', { className: 'device-name' }, [user.name, isMe ? el('span', { className: 'tag ms-2', text: 'Você' }) : null]),
            ]),
        ]),
        el('td', { className: 'mono', text: user.email }),
        el('td', {}, [el('span', { className: ROLES[user.role].tagClass, text: ROLES[user.role].label })]),
        el('td', { className: 'mono', text: formatDateTime(user.createdAt) }),
        el('td', { className: 'cell-actions text-end' }, [el('div', { className: 'row-actions', attrs: { role: 'group', 'aria-label': `Ações de ${user.name}` } }, actions)]),
    ]);
}

function render(users) {
    const admins = users.filter((u) => u.role === 'admin').length;
    syncBadges(document.getElementById('roleBadges'), [
        { key: 'admin', tone: 'primary', text: `${admins} admin(s)` },
        { key: 'viewer', tone: 'neutral', text: `${users.length - admins} visualizador(es)` },
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

async function changeRole(user, button) {
    const promote = user.role === 'viewer';
    const confirmed = await confirmDialog({
        title: promote ? 'Tornar administrador' : 'Tornar visualizador',
        message: promote
            ? `${user.name} poderá cadastrar, editar e excluir dispositivos, reconhecer alertas e gerenciar usuários.`
            : `${user.name} passará a só visualizar o painel, sem alterar nada.`,
        confirmText: promote ? 'Tornar administrador' : 'Tornar visualizador',
    });
    if (!confirmed) return;
    button.disabled = true;
    try {
        await api('PATCH', `/users/${user.id}`, { role: promote ? 'admin' : 'viewer' });
        toast(`${user.name} agora é ${promote ? 'administrador' : 'visualizador'}.`);
        poller.refresh();
    } catch (err) {
        showError(err); // ex.: 409 se for o último admin
        button.disabled = false;
    }
}

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

/** Abre o modal vazio (conta nova) ou preenchido com o usuário a editar. */
function openUserForm(user = null) {
    editing = user;
    userForm.reset();
    clearFieldErrors(userForm);
    hideFormMessage(userFormMessage);
    const isMe = user?.id === me.id;
    setText(document.getElementById('userModalTitle'), user ? `Editar ${user.name}` : 'Novo usuário');
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
userModalElement.addEventListener('shown.bs.modal', () => userField('name').focus());

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
        toast(editing ? `Conta de ${user.name} atualizada.` : `Conta de ${user.name} criada.`);
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
            showFormMessage(userFormMessage, err.message); // ex.: 409 se tirar o último admin
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
