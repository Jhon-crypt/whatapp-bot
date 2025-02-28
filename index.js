const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');
// const { clickSearch } = require('./click-search.js');

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
                // Wait for the filter buttons to be present
                await page.waitForSelector('[role="tablist"][aria-label="chat-list-filters"]');
                
                // Use the exact ID for the filter button
                const buttonSelector = `#${filterType}-filter`;
                await page.waitForSelector(buttonSelector);
                
                // Click the button using evaluate for a more direct click
                await page.evaluate((selector) => {
                    const button = document.querySelector(selector);
                    if (button) button.click();
                }, buttonSelector);

                // Wait for the filter to be applied using delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log(`Successfully switched to ${filterType} filter`);
            } catch (error) {
                console.error(`Error switching to ${filterType} filter:`, error);
            }
        }

        // Function to check for messages based on current filter
        async function checkMessages() {
            try {
                // Wait for chats to load with a longer timeout
                await new Promise(resolve => setTimeout(resolve, 3000));

                // First ensure the chat list is loaded using the exact role and aria-label
                await page.waitForSelector('div[role="grid"][aria-label="Chat list"]', { timeout: 10000 })
                    .catch(() => console.log('Chat list not found, retrying...'));

                // Get unread chats using the actual WhatsApp Web structure
                const unreadChats = await page.evaluate(() => {
                    try {
                        const chatList = document.querySelector('div[role="grid"][aria-label="Chat list"]');
                        if (!chatList) {
                            console.log('Chat list not found in DOM');
                            return [];
                        }

                        // Use multiple selectors to ensure we find chat items
                        const chatItems = Array.from(chatList.querySelectorAll('div[role="listitem"]'));
                        if (!chatItems || chatItems.length === 0) {
                            console.log('No chat items found');
                            return [];
                        }

                        const unreadItems = [];

                        chatItems.forEach(item => {
                            try {
                                // Multiple ways to detect unread messages
                                const unreadBadge = item.querySelector('span[aria-label*="unread message"], span[aria-label*="messages unread"]');
                                if (!unreadBadge) return;

                                // Get chat title with fallback methods
                                const titleSpan = item.querySelector('span[title], [data-testid="contact-name"]');
                                const title = titleSpan ? (titleSpan.getAttribute('title') || titleSpan.textContent) : 'Unknown Chat';

                                // Get unread count with better parsing
                                const unreadLabel = unreadBadge.getAttribute('aria-label') || '';
                                const unreadMatch = unreadLabel.match(/(\d+)/);
                                const unreadCount = unreadMatch ? parseInt(unreadMatch[0]) : 1;

                                // Get last message with multiple selectors
                                const lastMessageEl = item.querySelector('.x78zum5.x1cy8zhl, [data-testid="last-message"]');
                                const lastMessage = lastMessageEl?.textContent?.trim() || '';

                                // Get timestamp with multiple selectors
                                const timestampEl = item.querySelector('._ak8i, [data-testid="last-message-time"]');
                                const timestamp = timestampEl?.textContent?.trim() || '';

                                // Additional chat type detection
                                const isGroup = !!item.querySelector('[data-testid="group"]');
                                const isMuted = !!item.querySelector('[data-testid="muted"]');
                                
                                if (unreadCount > 0) {
                                    unreadItems.push({
                                        title: title,
                                        unreadCount: unreadCount,
                                        lastMessage: lastMessage,
                                        timestamp: timestamp,
                                        isGroup: isGroup,
                                        isMuted: isMuted,
                                        type: isGroup ? 'group' : 'contact'
                                    });
                                }
                            } catch (itemError) {
                                console.log('Error processing chat item:', itemError);
                            }
                        });

                        // Sort by unread count (most unread first)
                        return unreadItems.sort((a, b) => b.unreadCount - a.unreadCount);
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
                        console.log(`💬 Last message: ${chat.lastMessage}`);
                        console.log(`🕒 ${chat.timestamp}`);
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

                    // Only search for the first chat in the list
                    if (unreadChatNames.length > 0) {
                        const firstChat = unreadChatNames[0];
                        console.log(`\nSearching first chat: ${firstChat.name}`);
                        
                        // Click the search button
                        await page.waitForSelector('button._ai0b._ai08[aria-label="Search or start new chat"]');
                        await page.evaluate(() => {
                            const searchButton = document.querySelector('button._ai0b._ai08[aria-label="Search or start new chat"]');
                            if (searchButton) searchButton.click();
                        });

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
                        await page.type('div[contenteditable="true"][data-tab="3"]', firstChat.name);
                        console.log('Typed chat name:', firstChat.name);

                        // Wait for 2 seconds before pressing Enter
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        console.log('Waiting 2 seconds before pressing Enter...');

                        // Press Enter
                        await page.keyboard.press('Enter');
                        console.log('Pressed Enter key');

                        // Wait for chat container to load
                        await page.waitForSelector('div[role="application"]');
                        console.log('Chat container loaded');

                        // Return to search form by clicking search button again
                        await page.waitForSelector('button._ai0b._ai08[aria-label="Search or start new chat"]');
                        await page.evaluate(() => {
                            const searchButton = document.querySelector('button._ai0b._ai08[aria-label="Search or start new chat"]');
                            if (searchButton) searchButton.click();
                        });
                        console.log('Returned to search form');

                        // Wait for search input to be ready
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await page.waitForSelector('div[aria-label="Search"][role="textbox"]');

                        // Clear the search form by pressing backspace
                        const inputValue = await page.$eval('div[aria-label="Search"][role="textbox"]', el => el.textContent.length);
                        for (let i = 0; i < inputValue; i++) {
                            await page.keyboard.press('Backspace');
                        }
                        console.log('Cleared search form using backspace');

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

                        console.log('Chat messages:', messages);

                        // Click the search icon using page.click()
                        await page.waitForSelector('span[data-icon="search"]');
                        await page.click('span[data-icon="search"]');
                        console.log('Clicked search icon');
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