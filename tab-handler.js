// v133.2: TAB NAVIGATION HANDLER

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('tab-btn')) {
        const targetTab = e.target.getAttribute('data-tab');
        
        // Remove active class from all buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        
        // Remove active class from all panes
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked button
        e.target.classList.add('active');
        
        // Add active class to target pane
        const targetPane = document.getElementById(targetTab);
        if (targetPane) {
            targetPane.classList.add('active');
        }
    }
});


