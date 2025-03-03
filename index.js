const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');
// const { clickSearch } = require('./click-search.js');

// Function to save or update messages in a single JSON file
async function saveMessagesToJson(chatName, messages, isGroup) {
    try {
        // Create messages directory if it doesn't exist
        const messagesDir = path.join(__dirname, 'messages');
        await fs.mkdir(messagesDir, { recursive: true });

        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `whatsapp_messages_${timestamp}.json`;
        const filePath = path.join(messagesDir, fileName);

        // Read existing data or create new structure
        let allMessages = {};
        try {
            const existingData = await fs.readFile(filePath, 'utf8');
            allMessages = JSON.parse(existingData);
        } catch (error) {
            // File doesn't exist or is invalid, create new structure
            allMessages = {
                date: timestamp,
                last_updated: new Date().toISOString(),
                chats: {}
            };
        }

        // Update the messages for this chat
        allMessages.chats[chatName] = {
            chatName,
            isGroup,
            last_updated: new Date().toISOString(),
            messages
        };

        // Update the last_updated timestamp
        allMessages.last_updated = new Date().toISOString();

        // Write back to file with pretty printing
        await fs.writeFile(filePath, JSON.stringify(allMessages, null, 2));
        console.log(`Messages updated in ${fileName}`);
    } catch (error) {
        console.error(`Error saving messages for ${chatName}:`, error);
    }
}

async function startWhatsAppBot() {
    try {
        // Launch the browser
        const browser = await puppeteer.launch({
            headless: false,
            userDataDir: './my-session', // Save session data in this folder
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: ['--no-sandbox']
        });

        // Create a new page
        const page = await browser.newPage();

        // Go to WhatsApp Web
        await page.goto('https://web.whatsapp.com');

        console.log('Please scan the QR code in the browser window to log in');

        // Wait for successful login by checking for the disappearance of the QR code canvas
        await page.waitForFunction(() => !document.querySelector('canvas[aria-label="Scan this QR code to link a device!"]'));
        console.log('Waiting for chats to load!');

        // Function to switch filter
        async function switchFilter(filterType) {
            try {
                console.log(`Attempting to switch to ${filterType} filter...`);
                
                // Wait for the filter buttons to be present
                await page.waitForSelector('[role="tablist"][aria-label="chat-list-filters"]', { timeout: 10000 });
                console.log('Found filter tablist');
                
                // Use the exact ID for the filter button
                const buttonSelector = `#${filterType}-filter`;
                await page.waitForSelector(buttonSelector, { timeout: 10000 });
                console.log('Found filter button');
                
                // Click the button using evaluate for a more direct click
                await page.evaluate((selector) => {
                    const button = document.querySelector(selector);
                    if (button) {
                        console.log('Clicking filter button...');
                        button.click();
                    } else {
                        console.log('Filter button not found in evaluate');
                    }
                }, buttonSelector);

                // Wait longer for the filter to be applied
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log(`Switched to ${filterType} filter and waited 5 seconds`);
            } catch (error) {
                console.error(`Error switching to ${filterType} filter:`, error);
            }
        }

        // Function to check for messages based on current filter
        async function checkMessages() {
            try {
                console.log('Starting to check for unread messages...');
                
                // Wait longer for chats to load
                await new Promise(resolve => setTimeout(resolve, 5000));
                console.log('Waited 5 seconds for initial load');

                // First ensure the chat list is loaded using the exact role and aria-label
                await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 15000 })
                    .then(() => console.log('Chat list found'))
                    .catch(() => console.log('Chat list not found, retrying...'));

                // Get unread chats using the actual WhatsApp Web structure
                const unreadChats = await page.evaluate(() => {
                    try {
                        console.log('Starting chat evaluation...');
                        const chatList = document.querySelector('div[role="grid"][aria-label="Chat list"]');
                        if (!chatList) {
                            console.log('Chat list not found in DOM');
                            return [];
                        }

                        // Log the number of list items found
                        const chatItems = Array.from(chatList.querySelectorAll('div[role="listitem"]'));
                        console.log(`Found ${chatItems.length} chat items`);

                        const unreadItems = [];

                        chatItems.forEach((item, index) => {
                            try {
                                // Log each chat item being processed
                                console.log(`Processing chat item ${index + 1}...`);

                                // Check for any unread indicators
                                const unreadBadge = item.querySelector('span[aria-label="Unread"]') || 
                                                  item.querySelector('span[class*="unread"]') ||
                                                  item.querySelector('span[class*="x1rg5ohu"][class*="x1xaadd7"][class*="x1pg5gke"]');
                                
                                // Also check for number badges
                                const numberBadge = item.querySelector('span[class*="_19RFN"]') ||
                                                  item.querySelector('span[class*="unread-count"]');

                                if (unreadBadge || numberBadge) {
                                    console.log(`Found unread indicators in chat ${index + 1}`);
                                    
                                    // Get chat title with enhanced fallback methods
                                    const titleSpan = item.querySelector([
                                        'span[title]',
                                        '[data-testid="contact-name"]',
                                        '[data-testid="group-name"]',
                                        'span[class*="zoWT4"]',
                                        'span[dir="auto"]'
                                    ].join(', '));
                                    const title = titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent) : 'Unknown Chat';

                                    // Enhanced unread count detection
                                    let unreadCount = 1;
                                    if (unreadBadge || numberBadge) {
                                        const badge = numberBadge || unreadBadge;
                                        const badgeText = badge.textContent.trim();
                                        if (/^\d+$/.test(badgeText)) {
                                            unreadCount = parseInt(badgeText);
                                        }
                                    }

                                    // Additional chat type detection
                                    const isGroup = !!item.querySelector('[data-testid="group"]');
                                    const isMuted = !!item.querySelector('[data-testid="muted"]');
                                    
                                    unreadItems.push({
                                        title: title,
                                        unreadCount: unreadCount,
                                        isGroup: isGroup,
                                        isMuted: isMuted,
                                        type: isGroup ? 'group' : 'contact'
                                    });
                                    
                                    console.log(`Added unread chat: ${title} with ${unreadCount} messages`);
                                }
                            } catch (itemError) {
                                console.log('Error processing chat item:', itemError);
                            }
                        });

                        console.log(`Found ${unreadItems.length} unread chats`);
                        return unreadItems;
                    } catch (evalError) {
                        console.log('Error in page.evaluate:', evalError);
                        return [];
                    }
                });

                // Validate unreadChats before using it
                if (!Array.isArray(unreadChats)) {
                    console.log('Invalid unreadChats result, skipping this check');
                    return;
                }

                // Print the unread messages summary and collect names
                if (unreadChats.length > 0) {
                    console.log('\n=== Unread Messages Summary ===');
                    
                    // Array to store all chat names
                    const unreadChatNames = [];
                    
                    // Process each unread chat
                    for (const chat of unreadChats) {
                        console.log(`\n${chat.isGroup ? '👥' : '👤'} ${chat.title} ${chat.isMuted ? '🔇' : ''}`);
                        console.log(`📩 ${chat.unreadCount} unread message(s)`);
                        console.log('----------------------------');

                        // Add chat name to our list
                        unreadChatNames.push({
                            name: chat.title,
                            isGroup: chat.isGroup,
                            unreadCount: chat.unreadCount
                        });
                    }
                    
                    // Print compiled list of chat names
                    console.log('\n=== Compiled List of Unread Chats ===');
                    console.log('Individual Chats:');
                    const individualChats = unreadChatNames.filter(chat => !chat.isGroup);
                    individualChats.forEach(chat => {
                        console.log(`- ${chat.name} (${chat.unreadCount} unread)`);
                    });

                    console.log('\nGroup Chats:');
                    const groupChats = unreadChatNames.filter(chat => chat.isGroup);
                    groupChats.forEach(chat => {
                        console.log(`- ${chat.name} (${chat.unreadCount} unread)`);
                    });

                    console.log(`\nTotal unread chats: ${unreadChatNames.length}`);
                    console.log(`Individual chats: ${individualChats.length}`);
                    console.log(`Group chats: ${groupChats.length}`);

                    // Process all chats in the list
                    for (const chat of unreadChatNames) {
                        try {
                            console.log(`\nProcessing chat: ${chat.name}`);
                            
                            try {
                                // Try the original search button selector first
                                await page.waitForSelector('button._ai0b._ai08[aria-label="Search or start new chat"]', { timeout: 5000 });
                                await page.evaluate(() => {
                                    const searchButton = document.querySelector('button._ai0b._ai08[aria-label="Search or start new chat"]');
                                    if (searchButton) searchButton.click();
                                });
                            } catch (searchError) {
                                try {
                                    console.log('Trying alternative search button...');
                                    // Try the alternative search button
                                    await page.waitForSelector('span[data-icon="search"]', { timeout: 5000 });
                                    await page.click('span[data-icon="search"]');
                                } catch (altSearchError) {
                                    console.error(`Failed to click search button for chat ${chat.name}, moving to next chat...`);
                                    continue;  // Skip to the next chat
                                }
                            }

                            // Wait for search input to be ready
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            await page.waitForSelector('div[contenteditable="true"][data-tab="3"]');

                            // Clear any existing search text
                            await page.evaluate(() => {
                                const searchInput = document.querySelector('div[contenteditable="true"][data-tab="3"]');
                                if (searchInput) {
                                    searchInput.textContent = '';
                                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            });

                            // Type the chat name using page.type()
                            await page.type('div[contenteditable="true"][data-tab="3"]', chat.name);
                            console.log('Typed chat name:', chat.name);

                            // Wait for search results to appear
                            await new Promise(resolve => setTimeout(resolve, 2000));

                            // Press Enter and wait for chat to load
                            await page.keyboard.press('Enter');
                            console.log('Pressed Enter key');

                            // Wait for chat container to load
                            await page.waitForSelector('div[role="application"]', { timeout: 10000 });
                            console.log('Chat container loaded');

                            // Fetch messages from the chat
                            const messages = await page.evaluate(() => {
                                const messageElements = document.querySelectorAll('div[class*="_amjv"]');
                                return Array.from(messageElements).map(msg => {
                                    const messageText = msg.querySelector('span.selectable-text.copyable-text');
                                    const timestamp = msg.querySelector('span[class*="x1c4vz4f x2lah0s"]');
                                    const isOutgoing = msg.classList.contains('message-out');
                                    
                                    return {
                                        text: messageText ? messageText.textContent : '',
                                        time: timestamp ? timestamp.textContent : '',
                                        type: isOutgoing ? 'sent' : 'received'
                                    };
                                }).filter(m => m.text);
                            });

                            console.log(`Messages from ${chat.name}:`, messages);

                            // Save messages to JSON file if there are any
                            if (messages.length > 0) {
                                await saveMessagesToJson(chat.name, messages, chat.isGroup);
                            }

                            // If messages array is empty, try clicking search and move to next chat
                            if (messages.length === 0) {
                                console.log('No messages found, trying to click search and move to next chat...');
                                try {
                                    await page.waitForSelector('span[data-icon="search"]', { timeout: 5000 });
                                    await page.click('span[data-icon="search"]');
                                    
                                    // Wait for the chat list to be visible again
                                    await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 10000 });
                                    
                                    // Wait before processing next chat
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    console.log(`Skipping chat ${chat.name} due to no messages`);
                                    continue;
                                } catch (searchError) {
                                    console.error('Failed to click search button:', searchError.message);
                                }
                            }

                            // Click back button to return to chat list
                            await page.evaluate(() => {
                                const backButton = document.querySelector('div._ah_x._ai0a span[data-icon="back"]');
                                if (backButton) {
                                    backButton.parentElement.click();
                                }
                            });

                            // Wait for the chat list to be visible again
                            await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 10000 });
                            
                            // Wait before processing next chat
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            console.log(`Finished processing chat: ${chat.name}`);

                        } catch (error) {
                            console.error(`Error processing chat ${chat.name}:`, error.message);
                            
                            // If error is about chat list selector timing out, try search button first
                            if (error.message.includes('Waiting for selector `div[role="grid"][aria-label="Chat list"]` failed')) {
                                try {
                                    console.log('Chat list timeout detected, trying search button...');
                                    await page.waitForSelector('span[data-icon="search"]', { timeout: 5000 });
                                    await page.click('span[data-icon="search"]');
                                    
                                    // Wait chat list to appear
                                    await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 10000 });
                                    
                                    // Add delay before next chat
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                    console.log(`Moving to next chat after search button click`);
                                    continue;
                                } catch (searchError) {
                                    console.error('Failed to click search button:', searchError.message);
                                }
                            }
                            
                            // Try to return to chat list if there's an error
                            try {
                                await page.evaluate(() => {
                                    const backButton = document.querySelector('div._ah_x._ai0a span[data-icon="back"]');
                                    if (backButton) {
                                        backButton.parentElement.click();
                                    }
                                });
                                await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 10000 });
                            } catch (backError) {
                                console.error('Could not return to chat list:', backError.message);
                                
                                // If back button fails, try search button as last resort
                                try {
                                    console.log('Back button failed, trying search button as last resort...');
                                    await page.waitForSelector('span[data-icon="search"]', { timeout: 5000 });
                                    await page.click('span[data-icon="search"]');
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                } catch (finalError) {
                                    console.error('All recovery attempts failed');
                                }
                            }
                            
                            // Continue with next chat
                            continue;
                        }
                    }
                } else {
                    console.log('No unread messages found.');
                }
            } catch (error) {
                console.error('Error checking messages:', error);
            }
        }

        // Start the process once
        console.log('Switching to unread messages filter...');
        await switchFilter('unread');
        await checkMessages();

    } catch (error) {
        console.error('An error occurred:', error);
        await browser.close();
    }
}

startWhatsAppBot(); 