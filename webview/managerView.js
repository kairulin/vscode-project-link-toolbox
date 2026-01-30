'use strict';

const vscode = acquireVsCodeApi();
let links = [];
let editingIndex = null;
let pendingAction = null;
let draggingIndex = null;
let hoverTargetIndex = null;

const rows = document.getElementById('linkRows');
const labelInput = document.getElementById('labelInput');
const urlInput = document.getElementById('urlInput');
const addButton = document.getElementById('addButton');
const cancelButton = document.getElementById('cancelButton');
const status = document.getElementById('status');

function setStatus(message, isError) {
	status.textContent = message || '';
	status.classList.toggle('error', Boolean(isError));
}

function enterEditMode(index, link) {
	editingIndex = index;
	labelInput.value = link.label;
	urlInput.value = link.url;
	addButton.textContent = 'Save';
	cancelButton.hidden = false;
	setStatus('Editing link...', false);
}

function exitEditMode() {
	editingIndex = null;
	addButton.textContent = 'Add';
	cancelButton.hidden = true;
	labelInput.value = '';
	urlInput.value = '';
}

function render() {
	rows.innerHTML = '';
	links.forEach((link, index) => {
		const tr = document.createElement('tr');
		tr.setAttribute('draggable', 'true');
		tr.dataset.index = String(index);

		const labelCell = document.createElement('td');
		labelCell.textContent = link.label;
		tr.appendChild(labelCell);

		const urlCell = document.createElement('td');
		urlCell.textContent = link.url;
		tr.appendChild(urlCell);

		const actionCell = document.createElement('td');
		const actionWrap = document.createElement('div');
		actionWrap.className = 'actions';
		const rowPrimary = document.createElement('div');
		rowPrimary.className = 'actions-row';
		const rowMove = document.createElement('div');
		rowMove.className = 'actions-row';
		const dragHandle = document.createElement('span');
		dragHandle.className = 'drag-handle';
		dragHandle.textContent = '⋮⋮';
		dragHandle.title = 'Drag to reorder';
		dragHandle.setAttribute('draggable', 'true');

		const editBtn = document.createElement('span');
		editBtn.className = 'action primary';
		editBtn.textContent = 'Edit';
		editBtn.addEventListener('click', () => {
			enterEditMode(index, link);
		});

		const delBtn = document.createElement('span');
		delBtn.className = 'action danger';
		delBtn.textContent = 'Delete';
		delBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'delete', index });
		});

		const upBtn = document.createElement('span');
		upBtn.className = 'action icon';
		upBtn.textContent = '↑';
		upBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'move', direction: 'up', index });
		});

		const downBtn = document.createElement('span');
		downBtn.className = 'action icon';
		downBtn.textContent = '↓';
		downBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'move', direction: 'down', index });
		});

		const topBtn = document.createElement('span');
		topBtn.className = 'action icon';
		topBtn.textContent = '⇡';
		topBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'move', direction: 'top', index });
		});

		const bottomBtn = document.createElement('span');
		bottomBtn.className = 'action icon';
		bottomBtn.textContent = '⇣';
		bottomBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'move', direction: 'bottom', index });
		});

		rowPrimary.appendChild(editBtn);
		rowPrimary.appendChild(delBtn);
		rowMove.appendChild(topBtn);
		rowMove.appendChild(upBtn);
		rowMove.appendChild(downBtn);
		rowMove.appendChild(bottomBtn);
		actionWrap.appendChild(rowPrimary);
		actionWrap.appendChild(rowMove);
		actionWrap.appendChild(dragHandle);
		actionCell.appendChild(actionWrap);
		tr.appendChild(actionCell);

		dragHandle.addEventListener('dragstart', (event) => {
			draggingIndex = index;
			event.dataTransfer.setData('text/plain', String(index));
			event.dataTransfer.effectAllowed = 'move';
		});
		tr.addEventListener('dragstart', (event) => {
			if (event.target !== dragHandle) {
				event.preventDefault();
			}
		});
		tr.addEventListener('dragover', (event) => {
			event.preventDefault();
			if (draggingIndex === null) {
				return;
			}
			const targetIndex = Number(tr.dataset.index);
			if (Number.isNaN(targetIndex) || targetIndex === draggingIndex) {
				tr.classList.remove('drag-over');
				tr.classList.remove('drag-over-top');
				tr.classList.remove('drag-over-bottom');
				return;
			}
			tr.classList.add('drag-over');
			const isMovingDown = targetIndex > draggingIndex;
			hoverTargetIndex = targetIndex;
			tr.dataset.dropSide = isMovingDown ? 'bottom' : 'top';
			tr.classList.toggle('drag-over-top', !isMovingDown);
			tr.classList.toggle('drag-over-bottom', isMovingDown);
		});
		tr.addEventListener('dragleave', () => {
			tr.classList.remove('drag-over');
			tr.classList.remove('drag-over-top');
			tr.classList.remove('drag-over-bottom');
			delete tr.dataset.dropSide;
		});
		tr.addEventListener('drop', (event) => {
			event.preventDefault();
			tr.classList.remove('drag-over');
			tr.classList.remove('drag-over-top');
			tr.classList.remove('drag-over-bottom');
			draggingIndex = null;
			const fromIndex = Number(event.dataTransfer.getData('text/plain'));
			const toIndex = typeof hoverTargetIndex === 'number' ? hoverTargetIndex : -1;
			hoverTargetIndex = null;
			if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) {
				return;
			}
			vscode.postMessage({ type: 'moveTo', fromIndex, toIndex });
		});
		tr.addEventListener('dragend', () => {
			draggingIndex = null;
			hoverTargetIndex = null;
		});

		rows.appendChild(tr);
	});
}

addButton.addEventListener('click', () => {
	const label = labelInput.value.trim();
	const url = urlInput.value.trim();
	if (!label || !url) {
		setStatus('Label and URL are required.', true);
		return;
	}
	if (editingIndex === null) {
		pendingAction = 'add';
		vscode.postMessage({ type: 'add', label, url });
	} else {
		pendingAction = 'edit';
		vscode.postMessage({ type: 'edit', index: editingIndex, label, url });
	}
});

cancelButton.addEventListener('click', () => {
	exitEditMode();
	setStatus('', false);
});

window.addEventListener('message', (event) => {
	const message = event.data;
	if (message.type === 'links') {
		links = message.links || [];
		render();
		if (pendingAction) {
			exitEditMode();
			setStatus('Saved.', false);
			pendingAction = null;
		}
	}
	if (message.type === 'error') {
		setStatus(message.message || 'Something went wrong.', true);
		pendingAction = null;
	}
	if (message.type === 'info') {
		setStatus(message.message || '', false);
	}
});

vscode.postMessage({ type: 'ready' });
