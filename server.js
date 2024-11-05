// server.js
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

function validateUrls(urls) {
    if (urls.length < 1 || urls.length > 20) {
        throw new Error('Please enter between 1 and 20 URLs');
    }

    const urlRegex = /^(http|https):\/\/[^ "]+$/;
    for (let url of urls) {
        if (!urlRegex.test(url)) {
            throw new Error(`Invalid URL format: ${url}`);
        }
    }
    return true;
}

async function getFinalUrl(url, maxRedirects = 5) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        let currentUrl = url;
        let redirectCount = 0;

        while (redirectCount < maxRedirects) {
            const response = await fetch(currentUrl, {
                method: 'HEAD',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
                currentUrl = new URL(response.headers.get('location'), currentUrl).href;
                redirectCount++;
            } else {
                clearTimeout(timeout);
                return currentUrl;
            }
        }

        clearTimeout(timeout);
        return currentUrl;
    } catch (error) {
        if (error.name === 'AbortError') {
            return 'Error: Request timed out';
        }
        return `Error: ${error.message}`;
    }
}

async function extractLinks(html, baseUrl) {
    try {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        const links = Array.from(doc.getElementsByTagName('a'))
            .map(a => {
                try {
                    const href = a.getAttribute('href');
                    if (!href) return null;
                    return new URL(href, baseUrl).href;
                } catch (e) {
                    return null;
                }
            })
            .filter(url => url !== null && (url.includes('aka.ms') || url.includes('query.prod')));

        return [...new Set(links)];
    } catch (error) {
        console.error(`Error extracting links from ${baseUrl}:`, error);
        return [];
    }
}

async function fetchUrl(url, retryCount = 2) {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 30000
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            const extractedLinks = await extractLinks(html, url);

            const destinationUrls = await Promise.allSettled(
                extractedLinks.map(async (link) => {
                    const finalUrl = await getFinalUrl(link);
                    return {
                        originalUrl: link,
                        destinationUrl: finalUrl
                    };
                })
            );

            const validDestinations = destinationUrls
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);

            return {
                sourceUrl: url,
                fetchedUrls: extractedLinks,
                destinationUrls: validDestinations,
                status: 'success'
            };
        } catch (error) {
            if (attempt === retryCount) {
                return {
                    sourceUrl: url,
                    fetchedUrls: [],
                    destinationUrls: [],
                    status: 'error',
                    error: error.message
                };
            }
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
}

function countRedLinks(results) {
    let redLinksCount = 0;

    for (const result of results) {
        if (result.status === 'error') {
            redLinksCount++;
        } else {
            for (const link of result.destinationUrls) {
                if (link.destinationUrl.startsWith('Error')) {
                    redLinksCount++;
                }
            }
        }
    }

    return redLinksCount;
}

app.post('/api/fetch-urls', async (req, res) => {
    try {
        const urls = req.body.urls.split('\n')
            .map(url => url.trim())
            .filter(url => url);
        
        validateUrls(urls);
        const results = await Promise.all(urls.map(url => fetchUrl(url)));
        
        const redLinksCount = countRedLinks(results);
        const summary = {
            total: results.length,
            successful: results.filter(r => r.status === 'success').length,
            failed: results.filter(r => r.status === 'error').length,
            redLinksCount // Display the count of red-highlighted links here
        };

        res.json({ 
            success: true, 
            results,
            summary 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
