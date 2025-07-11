// ui.js
import { auth, signInWithPopup, GoogleAuthProvider } from './firebase.js';

// --- DOM Elements ---
const loginModal = document.getElementById('login-modal');
const viewItemModal = document.getElementById('view-item-modal');
const confirmModal = document.getElementById('confirm-modal');
const imageUploader = document.getElementById('image-uploader');
const imageInput = document.getElementById('image-input');
const imageUploadPrompt = document.getElementById('image-upload-prompt');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const tabs = document.getElementById('tabs');
const tabContent = document.getElementById('tab-content');
const loggedInView = document.getElementById('logged-in-view');
const userEmailDisplay = document.getElementById('user-email-display');

// --- State for UI ---
let onImageUploadedCallback = null;
let onImageRemovedCallback = null;

// --- Modal Handling ---
export function openModal(modal) { modal.classList.remove('hidden'); }
export function closeModal(modal) { modal.classList.add('hidden'); }
export function closeAllModals() {
    [loginModal, viewItemModal, confirmModal].forEach(closeModal);
}

// --- Custom Confirm Modal ---
export function showConfirm(message) {
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmMessage = document.getElementById('confirm-message');
    
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        openModal(confirmModal);

        const onOk = () => {
            resolve(true);
            cleanup();
        };

        const onCancel = () => {
            resolve(false);
            cleanup();
        };
        
        const cleanup = () => {
            closeModal(confirmModal);
            confirmOkBtn.removeEventListener('click', onOk);
            confirmCancelBtn.removeEventListener('click', onCancel);
        };

        confirmOkBtn.addEventListener('click', onOk, { once: true });
        confirmCancelBtn.addEventListener('click', onCancel, { once: true });
    });
}

// --- Toast Notification ---
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    const icons = { info: 'info-circle', success: 'check-circle', error: 'exclamation-triangle' };
    toast.innerHTML = `<i class="fas fa-${icons[type]} toast-icon"></i> ${message}`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}

// --- UI Visibility ---
export function updateUIVisibility(isLoggedIn, user) {
    loggedInView.classList.toggle('hidden', !isLoggedIn);
    document.getElementById('logged-out-view').classList.toggle('hidden', isLoggedIn);
    userEmailDisplay.textContent = isLoggedIn ? (user.displayName || user.email) : '';
    
    document.querySelectorAll('.calculator-form-content, .materials-form-content, .saved-items-content, .assistant-content').forEach(el => {
        el.style.display = isLoggedIn ? 'block' : 'none';
    });
    document.querySelectorAll('.login-prompt-view').forEach(el => {
        el.style.display = isLoggedIn ? 'none' : 'block';
    });

    if (isLoggedIn) closeAllModals();
}

// --- Image Upload Logic ---
function handleImageFile(file) {
    if (!file.type.startsWith('image/')) { showToast('Vui lòng chọn một file ảnh.', 'error'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
        const imageData = { mimeType: file.type, data: reader.result.split(',')[1] };
        if(onImageUploadedCallback) {
            onImageUploadedCallback(imageData);
        }
        imagePreview.src = reader.result;
        imageUploadPrompt.classList.add('hidden');
        imagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

export function initializeImageUploader(uploadedCallback, removedCallback) {
    onImageUploadedCallback = uploadedCallback;
    onImageRemovedCallback = removedCallback;
    imageUploader.addEventListener('click', () => imageInput.click());
    imageUploader.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary-color)'; });
    imageUploader.addEventListener('dragleave', (e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-color)'; });
    imageUploader.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) handleImageFile(e.dataTransfer.files[0]);
    });
    imageInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleImageFile(e.target.files[0]); });
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(onImageRemovedCallback) {
            onImageRemovedCallback();
        }
        imageInput.value = '';
        imagePreview.src = '#';
        imagePreviewContainer.classList.add('hidden');
        imageUploadPrompt.classList.remove('hidden');
    });
}

// --- Tab Navigation ---
export function initializeTabs() {
    tabs.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button) {
            const tabName = button.dataset.tab;
            const currentActive = tabs.querySelector('.active');
            if(currentActive) currentActive.classList.remove('active');
            button.classList.add('active');
            
            for (let pane of tabContent.children) {
                pane.classList.toggle('hidden', pane.id !== `${tabName}-tab`);
            }
        }
    });
}

// --- Modal & Auth Button Listeners ---
async function handleGoogleLogin() {
    await signInWithPopup(auth, new GoogleAuthProvider());
}

export function initializeModals() {
    document.getElementById('open-login-modal-btn').addEventListener('click', () => openModal(loginModal));
    document.querySelectorAll('.modal-close-btn, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => { if (e.target === el) closeAllModals(); });
    });
    
    const googleLoginBtn = document.getElementById('google-login-btn');
    const loginError = document.getElementById('login-error');
    
    googleLoginBtn.addEventListener('click', async () => {
        loginError.textContent = '';
        try {
            await handleGoogleLogin();
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            loginError.textContent = "Không thể đăng nhập với Google. Vui lòng thử lại.";
        }
    });
}
