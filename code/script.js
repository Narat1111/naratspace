document.addEventListener('DOMContentLoaded', () => {

    console.log('App Marketplace Loaded');

    // Add interaction to "Get" links
    const getButtons = document.querySelectorAll('.get-button');

    getButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            
            // Prevents the link from navigating immediately
            event.preventDefault(); 
            
            // Stop the click from bubbling up to the card
            event.stopPropagation(); 
            
            // Check if the button has already been clicked/is disabled
            if (!button.getAttribute('data-disabled')) {
                // Set a custom attribute to track the state
                button.setAttribute('data-disabled', 'true');
                
                // Change button text and style for "Installing..."
                button.textContent = 'Installing...';
                button.style.backgroundColor = '#3b2857'; // Dark Purple
                button.style.color = '#673ab7'; // Eerie Violet
                
                // Simulate an installation delay
                setTimeout(() => {
                    button.textContent = 'Installed';
                    button.style.backgroundColor = '#2e5a2e'; // Dark Green/Slime
                    button.style.color = '#a2f8a2'; // Pale Green
                    button.style.fontWeight = '600';

                }, 2000);
            }
        });
    });

    // Add click event to the whole card to simulate navigating to a detail page
    const appCards = document.querySelectorAll('.app-card');
    
    appCards.forEach(card => {
        card.addEventListener('click', () => {
            const appName = card.querySelector('h3').textContent;
            console.log(`Navigating to details page for: ${appName}`);
        });
    });

});