document.addEventListener('DOMContentLoaded', function() {
    const API_BASE_URL = '/api';
    
    // validation helpers
    function validateEmail(email) {
        if (!email) return true; // optional field
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    function validatePhone(phone) {
        if (!phone) return false;
        const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
        const re = /^\+?\d{7,15}$/;
        return re.test(cleaned);
    }
    
    // --- UI helpers: global message, field errors, loading indicator ---
    function showGlobalMessage(text, type = 'success', timeout = 4000) {
        const el = document.getElementById('global-message');
        if (!el) return;
        el.className = ''; // clear
        el.classList.add(type === 'error' ? 'error' : 'success');
        el.textContent = text;
        el.classList.remove('hidden');
        if (timeout) setTimeout(() => el.classList.add('hidden'), timeout);
    }

    function showFieldError(fieldId, message) {
        const err = document.getElementById(`error-${fieldId}`);
        if (!err) return;
        err.textContent = message;
        err.classList.add('visible');
    }

    function clearFieldErrors(formRoot = document) {
        formRoot.querySelectorAll('.field-error').forEach(e => { e.textContent = ''; e.classList.remove('visible'); });
    }

    function showLoading() { const o = document.getElementById('loading-overlay'); if (o) o.classList.remove('hidden'); }
    function hideLoading() { const o = document.getElementById('loading-overlay'); if (o) o.classList.add('hidden'); }

    // --- Page specific logic ---
    if (document.querySelector('#schedule-view')) {
        initializeSchedulePage();
    }
    if (document.querySelector('#owner-management')) {
        initializeOwnerPage();
    }
    if (document.querySelector('#billing-management')) {
        initializeBillingPage();
    }

    // --- INITIALIZERS ---
    function initializeSchedulePage() {
        const scheduleTableBody = document.querySelector('#schedule-table tbody');
        const bookAppointmentForm = document.getElementById('book-appointment-form');
        const apptOwnerSelect = document.getElementById('appt-owner-select');
        const apptPetSelect = document.getElementById('appt-pet-select');
        const apptVetSelect = document.getElementById('appt-vet-select');
        const completeVisitModal = document.getElementById('complete-visit-modal');
        
        async function fetchAndRenderAppointments() {
            const response = await fetch(`${API_BASE_URL}/appointments`);
            const appointments = await response.json();
            scheduleTableBody.innerHTML = '';
            appointments.forEach(appt => {
                const row = document.createElement('tr');
                let actions = '';
                if (appt.Status === 'Scheduled') {
                    actions = `<button class="action-button complete" data-appt-id="${appt.AppID}">Complete Visit</button>`;
                }
                row.innerHTML = `
                    <td>${new Date(appt.Date).toLocaleDateString()} ${appt.Time}</td>
                    <td>${appt.PetName}</td>
                    <td>${appt.FirstName} ${appt.LastName}</td>
                    <td>${appt.VetName}</td>
                    <td>${appt.Reason}</td>
                    <td>${appt.Status}</td>
                    <td>${actions}</td>
                `;
                scheduleTableBody.appendChild(row);
            });
        }

        async function populateAppointmentDropdowns() {
            const [ownerRes, vetRes] = await Promise.all([
                fetch(`${API_BASE_URL}/owners`),
                fetch(`${API_BASE_URL}/veterinarians`)
            ]);
            const owners = await ownerRes.json();
            const vets = await vetRes.json();
            
            apptOwnerSelect.innerHTML = '<option value="">-- Select Owner --</option>';
            owners.forEach(owner => apptOwnerSelect.innerHTML += `<option value="${owner.OwnerID}">${owner.FirstName} ${owner.LastName}</option>`);
            
            apptVetSelect.innerHTML = '<option value="">-- Select Veterinarian --</option>';
            vets.forEach(vet => apptVetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name}</option>`);
        }

        apptOwnerSelect.addEventListener('change', async (e) => {
            const ownerId = e.target.value;
            apptPetSelect.innerHTML = '<option value="">-- Select Pet --</option>';
            if (ownerId) {
                const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
                const pets = await response.json();
                pets.forEach(pet => apptPetSelect.innerHTML += `<option value="${pet.PetID}">${pet.Name}</option>`);
            }
        });

        bookAppointmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors(bookAppointmentForm);
            const formData = {
                petId: document.getElementById('appt-pet-select').value, vetId: document.getElementById('appt-vet-select').value,
                date: document.getElementById('appt-date').value, time: document.getElementById('appt-time').value,
                reason: document.getElementById('appt-reason').value,
            };
            // basic client-side validation
            let valid = true;
            if (!formData.date) { showFieldError('appt-date', 'Date is required'); valid = false; }
            if (!formData.time) { showFieldError('appt-time', 'Time is required'); valid = false; }
            if (!formData.reason) { showFieldError('appt-reason', 'Reason is required'); valid = false; }
            if (!valid) return;
            showLoading();
            const response = await fetch(`${API_BASE_URL}/appointments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Appointment booked!', 'success');
                bookAppointmentForm.reset();
                fetchAndRenderAppointments();
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to book appointment.', 'error');
            }
        });

        if(completeVisitModal) {
            const completeVisitForm = document.getElementById('complete-visit-form');
            completeVisitForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const appId = document.getElementById('complete-appt-id').value;
                const formData = {
                    description: document.getElementById('visit-description').value, medicine: document.getElementById('visit-medicine').value,
                    notes: document.getElementById('visit-notes').value, cost: document.getElementById('visit-cost').value,
                };
                const response = await fetch(`${API_BASE_URL}/appointments/${appId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                hideLoading();
                if (response.ok) {
                    showGlobalMessage('Visit completed and bill generated!', 'success');
                    completeVisitForm.reset();
                    completeVisitModal.close();
                    fetchAndRenderAppointments();
                } else {
                    const error = await response.json().catch(() => ({}));
                    showGlobalMessage(`Failed to complete visit: ${error.message || 'Unknown error'}`, 'error');
                }
            });
        }

        populateAppointmentDropdowns();
        fetchAndRenderAppointments();
    }

    function initializeOwnerPage() {
        const addOwnerForm = document.getElementById('add-owner-form');
        const ownerTableBody = document.querySelector('#owner-table tbody');
        const addPetModal = document.getElementById('add-pet-modal');
        const addPetForm = document.getElementById('add-pet-form');
        const petDetailsContainer = document.getElementById('pet-details-container');
        const petTableBody = document.querySelector('#pet-table tbody');
        const manageVetsModal = document.getElementById('manage-vets-modal');
        const manageVetsForm = document.getElementById('manage-vets-form');

        async function fetchAndRenderOwners() {
            const response = await fetch(`${API_BASE_URL}/owners`);
            const owners = await response.json();
            ownerTableBody.innerHTML = '';
            owners.forEach(owner => {
                const row = document.createElement('tr');
                row.dataset.ownerId = owner.OwnerID;
                row.dataset.ownerName = `${owner.FirstName} ${owner.LastName}`;
                row.innerHTML = `
                    <td>${owner.FirstName} ${owner.LastName}</td>
                    <td>${owner.Phone}</td>
                    <td>${owner.Address}</td>
                    <td><button class="action-button" data-owner-id="${owner.OwnerID}" data-owner-name="${owner.FirstName} ${owner.LastName}">Add Pet</button></td>
                `;
                ownerTableBody.appendChild(row);
            });
        }
        
        async function showPetsForOwner(ownerId, ownerName) {
            document.querySelectorAll('#owner-table tr.selected').forEach(r => r.classList.remove('selected'));
            document.querySelector(`#owner-table tr[data-owner-id='${ownerId}']`).classList.add('selected');

            petDetailsContainer.classList.remove('hidden');
            document.getElementById('selected-owner-name').textContent = ownerName;
            
            const response = await fetch(`${API_BASE_URL}/owners/${ownerId}/pets`);
            const pets = await response.json();
            petTableBody.innerHTML = '';
            pets.forEach(pet => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${pet.Name}</td>
                    <td>${pet.Species}</td>
                    <td>${pet.Breed}</td>
                    <td>${new Date(pet.DoB).toLocaleDateString()}</td>
                    <td>${pet.Age}</td>
                    <td>
                      <button class="action-button view-history" data-pet-id="${pet.PetID}" data-pet-name="${pet.Name}">View History</button>
                      <button class="action-button" data-pet-id="${pet.PetID}" data-pet-name="${pet.Name}">Manage Vets</button>
                    </td>
                `;
                petTableBody.appendChild(row);
            });
        }
        
        ownerTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row || e.target.matches('button')) return;
            showPetsForOwner(row.dataset.ownerId, row.dataset.ownerName);
        });

        addOwnerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors(addOwnerForm);
            const formData = {
                firstName: document.getElementById('firstName').value, lastName: document.getElementById('lastName').value,
                phone: document.getElementById('phone').value, email: document.getElementById('email').value,
                address: document.getElementById('address').value,
            };
            // Add client-side validation before submit
            let valid = true;
            if (!formData.firstName) { showFieldError('firstName', 'First name required'); valid = false; }
            if (!formData.lastName) { showFieldError('lastName', 'Last name required'); valid = false; }
            if (!formData.phone) { showFieldError('phone', 'Phone is required'); valid = false; }
            else if (!validatePhone(formData.phone)) { showFieldError('phone', 'Invalid phone format (7–15 digits, optional +)'); valid = false; }
            if (formData.email && !validateEmail(formData.email)) { showFieldError('email', 'Invalid email format'); valid = false; }
            if (!formData.address) { showFieldError('address', 'Address is required'); valid = false; }
            if (!valid) return;

            showLoading();
            const response = await fetch(`${API_BASE_URL}/owners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            hideLoading();
            if (response.ok) {
                showGlobalMessage('Owner added!', 'success');
                addOwnerForm.reset();
                fetchAndRenderOwners();
            } else {
                const err = await response.json().catch(() => ({}));
                showGlobalMessage(err.message || 'Failed to add owner.', 'error');
            }
        });

        if (addPetModal) {
            addPetForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = {
                    name: document.getElementById('pet-name').value, species: document.getElementById('pet-species').value,
                    breed: document.getElementById('pet-breed').value, dob: document.getElementById('pet-dob').value,
                    ownerId: document.getElementById('pet-owner-id').value,
                };
                const response = await fetch(`${API_BASE_URL}/pets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    showGlobalMessage('Pet added successfully!', 'success');
                    addPetForm.reset();
                    addPetModal.close();
                    showPetsForOwner(formData.ownerId, document.getElementById('pet-owner-name').textContent);
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to add pet.', 'error');
                }
            });
        }

        if (manageVetsModal) {
            manageVetsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = {
                    petId: document.getElementById('manage-pet-id').value,
                    vetId: document.getElementById('vet-select').value,
                    isPrimary: Boolean(document.getElementById('is-primary-vet-checkbox').checked),
                };
                const response = await fetch(`${API_BASE_URL}/vet-pet-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
                if (response.ok) {
                    showGlobalMessage('Vet assigned successfully!', 'success');
                    manageVetsModal.close();
                } else {
                    const err = await response.json().catch(() => ({}));
                    showGlobalMessage(err.message || 'Failed to assign vet.', 'error');
                }
            });
        }
        
        fetchAndRenderOwners();
    }

    function initializeBillingPage() {
        const billingTableBody = document.querySelector('#billing-table tbody');
        
        async function fetchAndRenderBills() {
            const response = await fetch(`${API_BASE_URL}/billing`);
            const bills = await response.json();
            billingTableBody.innerHTML = '';
            bills.forEach(bill => {
                const row = document.createElement('tr');
                let actionButton = '';
                if (bill.Status === 'Unpaid') {
                    actionButton = `<button class="action-button" data-app-id="${bill.AppID}" data-bill-id="${bill.BillID}">Process Payment</button>`;
                }
                row.innerHTML = `
                    <td>${bill.BillID}</td>
                    <td>${new Date(bill.Date).toLocaleDateString()}</td>
                    <td>${bill.FirstName} ${bill.LastName}</td>
                    <td>${bill.PetName}</td>
                    <td>$${Number(bill.Amount).toFixed(2)}</td>
                    <td>${bill.Status}</td>
                    <td>${bill.Mode || 'N/A'}</td>
                    <td>${actionButton}</td>
                `;
                billingTableBody.appendChild(row);
            });
        }
        
        fetchAndRenderBills();

        billingTableBody.addEventListener('click', async (e) => {
            if (e.target.matches('.action-button[data-bill-id]')) {
                const appId = e.target.dataset.appId;
                const billId = e.target.dataset.billId;
                const mode = prompt("Enter payment mode (e.g., Cash, Card):");
                if (mode) {
                    showLoading();
                    const response = await fetch(`${API_BASE_URL}/billing/${appId}/${billId}/pay`, { 
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mode: mode })
                    });
                    hideLoading();
                    if (response.ok) {
                        showGlobalMessage('Payment processed!', 'success');
                        fetchAndRenderBills(); // Refresh the list
                    } else {
                        const err = await response.json().catch(() => ({}));
                        showGlobalMessage(err.message || 'Failed to process payment.', 'error');
                    }
                }
            }
        });
    }

    // --- Global Event Listeners ---
    document.body.addEventListener('click', async (e) => {
        // View pet history
        if (e.target.matches('.view-history')) {
            const petId = e.target.dataset.petId;
            const petName = e.target.dataset.petName;
            const modal = document.getElementById('pet-history-modal');
            const petInfo = document.getElementById('pet-info');
            const tbody = document.querySelector('#pet-history-table tbody');
            petInfo.innerHTML = `<strong>${petName}</strong>`;
            tbody.innerHTML = '';
            showLoading();
            try {
                const res = await fetch(`${API_BASE_URL}/pet-history/${petId}`);
                hideLoading();
                if (!res.ok) {
                    const err = await res.json().catch(()=>({message:'Failed to load history'}));
                    showGlobalMessage(err.message || 'Failed to load pet history', 'error');
                    return;
                }
                const rows = await res.json();
                if (rows.length > 0) {
                    const r0 = rows[0];
                    petInfo.innerHTML = `
                        <div><strong>Pet:</strong> ${r0.PetName} (${r0.Species} / ${r0.Breed})</div>
                        <div><strong>DOB:</strong> ${r0.DoB ? new Date(r0.DoB).toLocaleDateString() : ''}</div>
                        <div><strong>Owner:</strong> ${r0.FirstName} ${r0.LastName} — ${r0.OwnerPhone || ''}</div>
                    `;
                    rows.forEach(r => {
                        if (r.AppointmentDate) {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `<td>${new Date(r.AppointmentDate).toLocaleDateString()}</td><td>${r.Reason || ''}</td><td>${r.VetName || ''}</td>`;
                            tbody.appendChild(tr);
                        }
                    });
                } else {
                    petInfo.innerHTML = '<div>No history found for this pet.</div>';
                }
                modal.showModal();
            } catch (err) {
                hideLoading();
                showGlobalMessage('Network error while loading pet history', 'error');
            }
        }
        // Open "Add Pet" Modal
        if (e.target.matches('.action-button[data-owner-id]')) {
            const addPetModal = document.getElementById('add-pet-modal');
            document.getElementById('pet-owner-id').value = e.target.dataset.ownerId;
            document.getElementById('pet-owner-name').textContent = e.target.dataset.ownerName;
            addPetModal.showModal();
        }
        // Open "Manage Vets" Modal
        if (e.target.matches('#pet-table .action-button[data-pet-id]')) {
            const petId = e.target.dataset.petId;
            const petName = e.target.dataset.petName;
            const vetSelect = document.getElementById('vet-select');
            const assignedVetsList = document.getElementById('assigned-vets-list');
            const manageVetsModal = document.getElementById('manage-vets-modal');
            
            document.getElementById('manage-pet-id').value = petId;
            document.getElementById('manage-pet-name').textContent = petName;

            const [allVetsRes, assignedVetsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/veterinarians`),
                fetch(`${API_BASE_URL}/pets/${petId}/vets`)
            ]);
            const allVets = await allVetsRes.json();
            const assignedVets = await assignedVetsRes.json();
            
            vetSelect.innerHTML = '<option value="">-- Select a vet to assign --</option>';
            allVets.forEach(vet => {
                const isAssigned = assignedVets.find(av => av.VetID === vet.VetID);
                vetSelect.innerHTML += `<option value="${vet.VetID}">${vet.Name} ${isAssigned ? '(Already Assigned)' : ''}</option>`;
            });

            assignedVetsList.innerHTML = '<h4>Currently Assigned Vets:</h4>';
            if (assignedVets.length > 0) {
                let listHTML = '<ul>';
                assignedVets.forEach(vet => {
                    listHTML += `<li>${vet.Name} ${vet.is_primary_vet ? '<strong>(Primary)</strong>' : ''}</li>`;
                });
                listHTML += '</ul>';
                assignedVetsList.innerHTML += listHTML;
            } else {
                assignedVetsList.innerHTML += '<p>No vets assigned yet.</p>';
            }

            manageVetsModal.showModal();
        }
        // Open "Complete Visit" Modal
        if (e.target.matches('.action-button.complete')) {
            const completeVisitModal = document.getElementById('complete-visit-modal');
            document.getElementById('complete-appt-id').value = e.target.dataset.apptId;
            document.getElementById('visit-appt-id').textContent = e.target.dataset.apptId;
            completeVisitModal.showModal();
        }
        // Close any modal
        if (e.target.matches('.close-modal-btn')) {
            e.target.closest('dialog').close();
        }
    });
});