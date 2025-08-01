document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('.search-bar input');
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            console.log('Search input changed:', event.target.value);
            // In a real app, you would filter game results here based on the input.
        });
    }
});
