document.addEventListener('DOMContentLoaded', function() {
    const urlInput = document.getElementById('urlInput');
    const fetchButton = document.getElementById('fetchButton');
    const akaButton = document.getElementById('akaButton');
    const resultsSection = document.getElementById('resultsSection');
    const resultsBody = document.getElementById('resultsBody');
    const akaSection = document.getElementById('akaSection');
    const akaBody = document.getElementById('akaBody');
    const loadingSpinner = document.getElementById('loadingSpinner');

    let fetchedResults = [];

    async function fetchUrls() {
        const urls = urlInput.value;
        
        try {
            const response = await fetch(`${window.location.origin}/api/fetch-urls`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ urls }),
            });

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error);
            }

            return data;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    function displayResults(results, summary) {
        let akaToQueryProdCount = 0;
        let directQueryProdCount = 0;
        // let totalSpecialCount = 0;
    
        document.getElementById('akaToQueryCount').textContent = akaToQueryProdCount;
        document.getElementById('directQueryCount').textContent = directQueryProdCount;
        // document.getElementById('totalSpecialCount').textContent = totalSpecialCount;
    
        resultsBody.innerHTML = '';
    
        results.forEach(result => {
            const row = document.createElement('tr');
            const statusClass = result.status === 'error' ? 'error-row' : '';
    
            let urlsHtml = '';
            const maxUrls = Math.max(result.fetchedUrls.length, result.destinationUrls.length);
    
            for (let i = 0; i < maxUrls; i++) {
                const fetchedUrl = result.fetchedUrls[i] || '';
                const destinationUrl = result.destinationUrls[i] ? result.destinationUrls[i].destinationUrl : '';
                const hasError = destinationUrl.startsWith('Error');
                const isQueryProd = fetchedUrl.includes('query.prod') || destinationUrl.includes('query.prod');
                const isAkaMs = fetchedUrl.includes('aka.ms');
    
                if (isAkaMs && isQueryProd) {
                    akaToQueryProdCount++;
                } else if (isQueryProd) {
                    directQueryProdCount++;
                }
    
                // totalSpecialCount += isAkaMs || isQueryProd ? 1 : 0;
    
                urlsHtml += `<tr>
                    <td width="50%"><div class="url-cell ${isAkaMs ? 'aka-ms-highlight' : ''} ${isQueryProd ? 'query-prod-highlight' : ''}">${fetchedUrl}</div></td>
                    <td width="50%"><div class="url-cell ${hasError ? 'error-text' : ''} ${isQueryProd ? 'query-prod-highlight' : ''}">${destinationUrl}</div></td>
                </tr>`;
            }
    
            row.className = statusClass;
            row.innerHTML = `
                <td>
                    <div class="url-cell">${result.sourceUrl}</div>
                    ${result.status === 'error' ? `<div class="error-message">${result.error}</div>` : ''}
                </td>
                <td colspan="2">
                    <table class="inner-table">
                        <tbody>
                            ${urlsHtml}
                        </tbody>
                    </table>
                </td>
            `;
    
            resultsBody.appendChild(row);
        });
    
        document.getElementById('akaToQueryCount').textContent = akaToQueryProdCount;
        document.getElementById('directQueryCount').textContent = directQueryProdCount;
        // document.getElementById('totalSpecialCount').textContent = totalSpecialCount;
    
        resultsSection.style.display = 'block';
    }
    function displayAkaLinks(akaLinks) {
        akaBody.innerHTML = '';
        akaLinks.forEach(link => {
            const row = document.createElement('tr');
            const isAkaMs = link.akaUrl.includes('aka.ms');
            const isQueryProd = link.destination.includes('query.prod');
            const hasError = link.destination.startsWith('Error');
            
            row.innerHTML = `
                <td><div class="url-cell ${isAkaMs ? 'aka-ms-highlight' : ''}">${link.akaUrl}</div></td>
                <td class="${isQueryProd ? 'query-prod-highlight' : ''} ${hasError ? 'error-text' : ''}">
                    <div class="url-cell">${link.destination}</div>
                </td>
            `;
            akaBody.appendChild(row);
        });
        akaSection.style.display = 'block';
    }

    async function processAkaLinks() {
        try {
            const response = await fetch(`${window.location.origin}/api/process-aka`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ results: fetchedResults }),
            });

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error);
            }

            // Hide the results section and show only aka.ms results
            resultsSection.style.display = 'none';
            displayAkaLinks(data.akaLinks);
        } catch (error) {
            console.error('Error processing aka.ms links:', error);
            alert(error.message);
        }
    }

    fetchButton.addEventListener('click', async () => {
        loadingSpinner.style.display = 'flex';
        fetchButton.disabled = true;
        akaSection.style.display = 'none'; // Hide aka.ms section when fetching new URLs

        try {
            const data = await fetchUrls();
            displayResults(data.results, data.summary);
        } catch (error) {
            console.error('Error fetching URLs:', error);
            alert(error.message);
        } finally {
            loadingSpinner.style.display = 'none';
            fetchButton.disabled = false;
        }
    });

    akaButton.addEventListener('click', async () => {
        if (fetchedResults.length === 0) {
            alert('Please fetch URLs first');
            return;
        }

        loadingSpinner.style.display = 'flex';
        try {
            await processAkaLinks();
        } catch (error) {
            console.error('Error processing aka.ms links:', error);
            alert(error.message);
        } finally {
            loadingSpinner.style.display = 'none';
        }
    });
});