const puppeteer = require('puppeteer');
const qrcode = require('qrcode-terminal');

async function startWhatsAppBot() {
    try {
        // Launch the browser
        const browser = await puppeteer.launch({
            headless: false,
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

                // Print the unread messages summary
                if (unreadChats.length > 0) {
                    console.log('\n=== Unread Messages Summary ===');
                    unreadChats.forEach(chat => {
                        console.log(`\n${chat.isGroup ? '👥' : '👤'} ${chat.title} ${chat.isMuted ? '🔇' : ''}`);
                        console.log(`📩 ${chat.unreadCount} unread message(s)`);
                        console.log(`💬 Last message: ${chat.lastMessage}`);
                        console.log(`🕒 ${chat.timestamp}`);
                        // console.log(`📋 Type: ${chat.type}`);
                        console.log('----------------------------');
                    });
                    console.log(`\nTotal chats with unread messages: ${unreadChats.length}`);
                    // console.log(`Groups: ${unreadChats.filter(c => c.isGroup).length}`);
                    // console.log(`Contacts: ${unreadChats.filter(c => !c.isGroup).length}`);
                } else {
                    console.log('No unread messages found. Waiting for new messages...');
                }

            } catch (error) {
                console.error('Error checking messages:', error);
            }
            
            // Schedule the next check
            setTimeout(checkMessages, 5000);
        }

        // Function to handle different filters
        async function handleFilters() {
            // Start with unread messages
            console.log('Switching to unread messages filter...');
            await switchFilter('unread');
            await checkMessages();

            // Allow switching filters via console input
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });

            readline.on('line', async (input) => {
                const filter = input.toLowerCase();
                if (['all', 'unread', 'favorites', 'group'].includes(filter)) {
                    console.log(`Switching to ${filter} filter...`);
                    await switchFilter(filter);
                } else {
                    console.log('Available filters: all, unread, favorites, group');
                }
            });
        }

        // Start handling filters
        handleFilters();

    } catch (error) {
        console.error('An error occurred:', error);
        await browser.close();
    }
}

startWhatsAppBot(); 