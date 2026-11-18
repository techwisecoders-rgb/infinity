/* Inline application script extracted from the supplied infinity.html. */
// ── SOCIAL INTERACTIONS ──
        let activeCommentPost = null;
        let activeCommentButton = null;
        let postCommentSort = 'recent';
        const postCommentsByCard = new WeakMap();

        function getPostComments(post) {
            if (!postCommentsByCard.has(post)) postCommentsByCard.set(post, []);
            return postCommentsByCard.get(post);
        }

        function getPostCommentButton(post) {
            return Array.from(post.querySelectorAll('.action-group-left .action-btn'))
                .find(button => button.querySelector('i.fa-comment')) || null;
        }

        function formatCommentCount(value) {
            if (value >= 1000000) return `${(value / 1000000).toFixed(value % 1000000 ? 1 : 0).replace(/\.0$/, '')}M`;
            if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 ? 1 : 0).replace(/\.0$/, '')}K`;
            return String(value);
        }

        function openPostComments(post, commentButton = null) {
            if (!post || !post.classList.contains('social-post-card')) return;

            activeCommentPost = post;
            activeCommentButton = commentButton || getPostCommentButton(post);

            const preview = document.getElementById('postCommentsPreview');
            preview.replaceChildren();
            const postCopy = post.cloneNode(true);
            postCopy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
            postCopy.querySelectorAll('button').forEach(button => button.removeAttribute('onclick'));
            preview.appendChild(postCopy);

            const count = activeCommentButton?.querySelector('.action-count')?.textContent.trim() || '0';
            document.getElementById('postCommentsCount').textContent = `${count} Comments`;
            document.getElementById('postCommentsSortLabel').textContent = 'Sort by';
            postCommentSort = 'recent';
            renderPostComments();

            const overlay = document.getElementById('postCommentsOverlay');
            overlay.style.display = 'block';
            overlay.scrollTop = 0;
            document.getElementById('postCommentsInput').value = '';
        }

        function closePostComments() {
            document.getElementById('postCommentsOverlay').style.display = 'none';
            activeCommentPost = null;
            activeCommentButton = null;
        }

        function togglePostCommentSort() {
            postCommentSort = postCommentSort === 'recent' ? 'top' : 'recent';
            document.getElementById('postCommentsSortLabel').textContent = postCommentSort === 'recent' ? 'Recent' : 'Top';
            renderPostComments();
        }

        function renderPostComments() {
            const list = document.getElementById('postCommentsList');
            list.replaceChildren();
            if (!activeCommentPost) return;

            const comments = getPostComments(activeCommentPost);
            const orderedComments = postCommentSort === 'recent' ? [...comments].reverse() : [...comments];
            if (!orderedComments.length) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'post-comments-empty';
                emptyMessage.textContent = 'Be the first to comment.';
                list.appendChild(emptyMessage);
                return;
            }

            orderedComments.forEach(comment => {
                const row = document.createElement('article');
                row.className = 'post-comment';
                row.dataset.commentId = String(comment.id);

                const avatar = document.createElement('div');
                avatar.className = 'post-comments-avatar';
                avatar.textContent = 'V';

                const body = document.createElement('div');
                body.className = 'post-comment-body';
                const meta = document.createElement('div');
                meta.className = 'post-comment-meta';
                meta.textContent = `${comment.author} · ${comment.time}`;
                const text = document.createElement('div');
                text.textContent = comment.text;

                const actions = document.createElement('div');
                actions.className = 'post-comment-actions';
                const likeButton = createCommentAction('fa-regular fa-heart', comment.likes, 'Like comment');
                likeButton.classList.toggle('liked', comment.liked);
                likeButton.addEventListener('click', () => toggleCommentLike(comment.id));
                const replyButton = createCommentAction('fa-regular fa-comment', comment.replies.length, 'Reply to comment');
                replyButton.addEventListener('click', () => showCommentReplyForm(comment.id));
                const shareButton = createCommentAction('fa-regular fa-paper-plane', comment.shares, 'Share comment');
                shareButton.addEventListener('click', () => shareComment(comment.id));
                const repostButton = createCommentAction('fa-solid fa-retweet', comment.reposts, 'Repost comment');
                repostButton.classList.toggle('reposted', comment.reposted);
                repostButton.addEventListener('click', () => toggleCommentRepost(comment.id));
                const bookmarkButton = createCommentAction('fa-regular fa-bookmark', null, 'Bookmark comment');
                bookmarkButton.classList.toggle('bookmarked', comment.bookmarked);
                bookmarkButton.querySelector('i').className = comment.bookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
                bookmarkButton.addEventListener('click', () => toggleCommentBookmark(comment.id));
                actions.append(likeButton, replyButton, shareButton, repostButton, bookmarkButton);

                const replies = document.createElement('div');
                replies.className = 'post-comment-replies';
                comment.replies.forEach(reply => {
                    const replyRow = document.createElement('div');
                    replyRow.className = 'post-comment-reply';
                    const author = document.createElement('strong');
                    author.textContent = reply.author;
                    const replyText = document.createElement('span');
                    replyText.textContent = reply.text;
                    replyRow.append(author, replyText);
                    replies.appendChild(replyRow);
                });

                body.append(meta, text, actions);
                if (replies.childElementCount) body.appendChild(replies);
                row.append(avatar, body);
                list.appendChild(row);
            });
        }

        function createCommentAction(iconClass, count, label) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'post-comment-action';
            button.setAttribute('aria-label', label);

            const icon = document.createElement('i');
            icon.className = iconClass;
            button.appendChild(icon);
            if (count !== null) {
                const countLabel = document.createElement('span');
                countLabel.className = 'action-count';
                countLabel.textContent = String(count);
                button.appendChild(countLabel);
            }
            return button;
        }

        function findPostComment(commentId) {
            return getPostComments(activeCommentPost).find(comment => comment.id === commentId);
        }

        function toggleCommentLike(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.liked = !comment.liked;
            comment.likes = Math.max(0, comment.likes + (comment.liked ? 1 : -1));
            renderPostComments();
        }

        function toggleCommentRepost(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.reposted = !comment.reposted;
            comment.reposts = Math.max(0, comment.reposts + (comment.reposted ? 1 : -1));
            renderPostComments();
        }

        function toggleCommentBookmark(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.bookmarked = !comment.bookmarked;
            renderPostComments();
        }

        function shareComment(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.shares++;
            renderPostComments();
            openShareModal();
        }

        function showCommentReplyForm(commentId) {
            const row = document.querySelector(`.post-comment[data-comment-id="${commentId}"]`);
            if (!row || row.querySelector('.post-comment-reply-form')) return;

            const form = document.createElement('form');
            form.className = 'post-comment-reply-form';
            const input = document.createElement('input');
            input.className = 'post-comment-reply-input';
            input.type = 'text';
            input.placeholder = 'Add a reply...';
            input.autocomplete = 'off';
            input.setAttribute('aria-label', 'Add a reply');
            const submit = document.createElement('button');
            submit.className = 'post-comment-reply-submit';
            submit.type = 'submit';
            submit.textContent = 'Reply';

            form.addEventListener('submit', event => {
                event.preventDefault();
                const text = input.value.trim();
                const comment = findPostComment(commentId);
                if (!text || !comment) return;
                comment.replies.push({
                    author: 'Visitor',
                    text
                });
                renderPostComments();
            });

            form.append(input, submit);
            row.querySelector('.post-comment-body').appendChild(form);
            input.focus();
        }

        function submitPostComment(event) {
            event.preventDefault();
            const input = document.getElementById('postCommentsInput');
            const text = input.value.trim();
            if (!text || !activeCommentPost) return;

            const comments = getPostComments(activeCommentPost);
            comments.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                author: 'Visitor',
                text,
                time: 'now',
                likes: 0,
                liked: false,
                replies: [],
                shares: 0,
                reposts: 0,
                reposted: false,
                bookmarked: false
            });

            const countElement = activeCommentButton?.querySelector('.action-count');
            const countMatch = countElement?.textContent.trim().match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
            if (countElement && countMatch) {
                const multipliers = {
                    K: 1000,
                    M: 1000000,
                    B: 1000000000
                };
                const currentCount = Number(countMatch[1]) * (multipliers[(countMatch[2] || '').toUpperCase()] || 1);
                countElement.textContent = formatCommentCount(currentCount + 1);
                document.getElementById('postCommentsCount').textContent = `${countElement.textContent} Comments`;
            } else {
                const total = comments.length;
                document.getElementById('postCommentsCount').textContent = `${total} Comments`;
            }

            input.value = '';
            renderPostComments();
        }

        document.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target?.closest('button.action-btn');
            if (!button?.querySelector('i.fa-comment') || button.closest('#postCommentsPreview')) return;

            const post = button.closest('.social-post-card');
            if (!post) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            openPostComments(post, button);
        }, true);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.getElementById('postCommentsOverlay').style.display !== 'none') {
                closePostComments();
            }
        });

        function toggleLike(btn) {
            const icon = btn.querySelector('i'),
                count = btn.querySelector('.action-count');
            if (!count) return;
            btn.classList.toggle('liked');
            icon.className = btn.classList.contains('liked') ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            count.textContent = parseInt(count.textContent) + (btn.classList.contains('liked') ? 1 : -1);
        }

        function toggleBookmark(btn) {
            btn.classList.toggle('bookmarked');
            btn.querySelector('i').className = btn.classList.contains('bookmarked') ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
        }

        function toggleRepost(btn) {
            const count = btn.querySelector('.action-count');
            if (!count) return;
            btn.classList.toggle('reposted');
            count.textContent = parseInt(count.textContent) + (btn.classList.contains('reposted') ? 1 : -1);
        }

        function toggleFollow(btn) {
            btn.classList.toggle('following');
            btn.textContent = btn.classList.contains('following') ? 'Following' : '+ Follow';
        }

        // ── SHARE MODAL LOGIC ──
        function openShareModal() {
            document.getElementById('shareModalOverlay').classList.add('active');
        }

        function closeShareModal(event) {
            document.getElementById('shareModalOverlay').classList.remove('active');
        }

        function setHomeFeedFloatingActionsVisible(visible) {
            document.querySelectorAll('.home-feed-floating-action').forEach(button => {
                button.style.display = visible ? 'flex' : 'none';
            });
        }

        setHomeFeedFloatingActionsVisible(true);

        // ── PROFILE / FEED TOGGLE LOGIC ──
        let activeView = 'home'; // 'home', 'user', or 'company'

        function toggleUserPage() {
            setHomeFeedFloatingActionsVisible(false);
            const userPage = document.getElementById('userProfilePage');
            const companyPage = document.getElementById('personalProfilePage');
            const homeFeed = document.getElementById('socialFeed');
            const header = document.getElementById('mainHeader');
            const footer = document.querySelector('.fixed-footer');

            if (activeView === 'user') {
                activeView = 'home';
                userPage.style.display = 'none';
                companyPage.style.display = 'none';
                homeFeed.style.display = 'flex';
                footer.style.display = 'flex';
                header.classList.remove('hidden');
            } else {
                activeView = 'user';
                userPage.style.display = 'block';
                companyPage.style.display = 'none';
                homeFeed.style.display = 'none';
                footer.style.display = 'none';
                header.classList.add('hidden'); // Completely removes header from layout flow
                window.scrollTo(0, 0);
            }
        }

        function toggleCompanyPage() {
            setHomeFeedFloatingActionsVisible(false);
            const userPage = document.getElementById('userProfilePage');
            const companyPage = document.getElementById('personalProfilePage');
            const homeFeed = document.getElementById('socialFeed');
            const header = document.getElementById('mainHeader');
            const footer = document.querySelector('.fixed-footer');

            if (activeView === 'company') {
                activeView = 'home';
                companyPage.style.display = 'none';
                userPage.style.display = 'none';
                homeFeed.style.display = 'flex';
                footer.style.display = 'flex';
                header.classList.remove('hidden');
            } else {
                activeView = 'company';
                companyPage.style.display = 'block';
                userPage.style.display = 'none';
                homeFeed.style.display = 'none';
                footer.style.display = 'none';
                header.classList.add('hidden'); // Completely removes header from layout flow
                window.scrollTo(0, 0);
            }
        }

        function switchCompanyCategory(category, element) {
            document.querySelectorAll('.company-cat-btn').forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const softwareSec = document.getElementById('softwareSection');
            const edutechSec = document.getElementById('edutechSection');
            const softwareFeed = document.getElementById('softwareFeed');
            const edutechFeed = document.getElementById('edutechFeed');

            if (category === 'software') {
                softwareSec.style.display = 'block';
                edutechSec.style.display = 'none';
                softwareFeed.style.display = 'flex';
                edutechFeed.style.display = 'none';
            } else if (category === 'edutech') {
                softwareSec.style.display = 'none';
                edutechSec.style.display = 'block';
                softwareFeed.style.display = 'none';
                edutechFeed.style.display = 'flex';
            }
        }

        function switchUserCategory(category, element) {
            // Detect if this is called from Info Hub overlay or personal profile
            const isInfoHub = element && element.closest('#allInfoHubOverlay');

            if (isInfoHub) {
                // ── INFO HUB CONTEXT ──
                document.querySelectorAll('#allInfoHubOverlay .company-cat-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'rgba(0, 240, 255, 0.05)';
                    btn.style.borderColor = 'rgba(0, 240, 255, 0.3)';
                    btn.style.color = 'rgba(255, 255, 255, 0.7)';
                });

                if (element) {
                    element.classList.add('active');
                    element.style.background = 'rgba(0, 240, 255, 0.2)';
                    element.style.borderColor = '#00f0ff';
                    element.style.color = '#fff';
                }

                const footerTabs = document.querySelector('#allInfoHubOverlay .app-footer');
                const searchActionBar = document.getElementById('allInfoSearchActionBar');

                if (category === 'feed') {
                    if (searchActionBar) searchActionBar.style.display = 'none';
                    document.querySelectorAll('#allInfoHubOverlay .view-section').forEach(sec => sec.style.display = 'none');
                    if (footerTabs) footerTabs.style.display = 'none';
                    const userFeedSection = moveUserFeedToInfoHub();
                    if (userFeedSection) userFeedSection.style.display = 'block';
                } else {
                    // INFO tab
                    if (searchActionBar) searchActionBar.style.display = 'flex';
                    if (footerTabs) footerTabs.style.display = 'flex';
                    restoreUserFeedFromInfoHub();
                    const userFeedSection = document.getElementById('userFeedSection');
                    if (userFeedSection) userFeedSection.style.display = 'none';
                    const activeSubSection = document.getElementById(typeof currentAllInfoTab !== 'undefined' ? currentAllInfoTab : 'info-view-all');
                    if (activeSubSection) {
                        activeSubSection.style.display = 'block';
                    } else {
                        const firstView = document.querySelector('#allInfoHubOverlay .view-section');
                        if (firstView) firstView.style.display = 'block';
                    }
                }
                return;
            }

            // ── PERSONAL PROFILE CONTEXT (original logic) ──
            const userCatButtons = document.querySelectorAll('#userProfilePage .company-cat-btn');
            userCatButtons.forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const infoSection = document.getElementById('userInfoSection');
            const feedSection = document.getElementById('userFeedSection');

            if (category === 'info') {
                if (infoSection) infoSection.style.display = 'block';
                if (feedSection) feedSection.style.display = 'none';
            } else if (category === 'feed') {
                if (infoSection) infoSection.style.display = 'none';
                if (feedSection) feedSection.style.display = 'block';
            } else if (category === 'activity') {
                window.open('https://www.haisuperhero.com', '_blank');
                return;
            }
        }

        function filterPersonalTab(type, element) {
            document.querySelectorAll('#personalProfilePage .profile-tab-btn').forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const activeDivisionFeed = document.getElementById('softwareSection').style.display !== 'none' ?
                document.getElementById('softwareFeed') :
                document.getElementById('edutechFeed');

            const posts = activeDivisionFeed.querySelectorAll('.social-post-card');
            posts.forEach(post => {
                const postType = post.getAttribute('data-type');
                if (type === 'all' || postType === type) {
                    post.style.display = 'flex';
                } else {
                    post.style.display = 'none';
                }
            });
        }

        function filterFeed(type, element) {
            const homeSelected = type === 'all' &&
                element?.querySelector('.footer-label')?.textContent.trim().toUpperCase() === 'HOME';
            setHomeFeedFloatingActionsVisible(homeSelected);

            if (document.getElementById('spaceCategoryHeader').style.display !== 'none') {
                document.getElementById('spaceCategoryHeader').style.display = 'none';
                document.getElementById('spaceCategoryEmpty')?.remove();
                document.getElementById('mainHeader').classList.remove('hidden');
                document.getElementById('marketMatrixPage').style.display = 'none';
                isMarketOpen = false;
            }

            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            if (element) element.classList.add('active');

            // Close profile containers if open
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';
            document.getElementById('socialFeed').style.display = 'flex';

            // Manage dynamic header icon visibility based on selected filter
            const imgIcon = document.getElementById('imageHeaderIcon');
            const vidIcon = document.getElementById('videoHeaderIcon');

            if (type === 'image') {
                imgIcon.style.display = 'block';
                vidIcon.style.display = 'none';
            } else if (type === 'video') {
                imgIcon.style.display = 'none';
                vidIcon.style.display = 'block';
            } else {
                imgIcon.style.display = 'none';
                vidIcon.style.display = 'none';
            }

            let activeFeedSelector = '#socialFeed';
            if (activeView === 'user') {
                activeFeedSelector = '#userFeed';
            } else if (activeView === 'company') {
                activeFeedSelector = document.getElementById('softwareSection').style.display !== 'none' ?
                    '#softwareFeed' :
                    '#edutechFeed';
            }

            const feedContainer = document.querySelector(activeFeedSelector);
            if (!feedContainer) return;

            const posts = feedContainer.querySelectorAll('.social-post-card');

            // TOGGLE 3x4 MATRIX GRID FOR MEDIA TYPES (Both images and videos use grid layout when filtered)
            if (type !== 'all') {
                feedContainer.classList.add('matrix-grid');
            } else {
                feedContainer.classList.remove('matrix-grid');
            }

            posts.forEach(post => {
                const postType = post.getAttribute('data-type');
                if (type === 'all' || postType === type) {
                    post.style.display = 'flex';
                } else {
                    post.style.display = 'none';
                }
            });

            // Bind click listeners for full screen view on matrix grid items
            bindMatrixClickHandlers(feedContainer);

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Helper to bind click and touch events on cards when in matrix grid mode
        function bindMatrixClickHandlers(container) {
            container.querySelectorAll('.social-post-card').forEach(card => {
                // Clear any existing listeners to prevent duplication
                card.onclick = null;
                card.ontouchend = null;

                // Handle both normal clicks and mobile taps
                const triggerOpen = (e) => {
                    if (container.classList.contains('matrix-grid')) {
                        if (e.target.closest('.profile-feed-media-editor, .profile-feed-caption')) return;
                        e.preventDefault();
                        e.stopPropagation();
                        openFullScreenViewer(card);
                    }
                };

                card.onclick = triggerOpen;
                card.ontouchend = triggerOpen;
            });
        }

        // ── UPDATED FULL SCREEN MEDIA RENDERER FOR IMAGES & VIDEOS ──
        function renderFullScreenMedia() {
            const container = document.getElementById('fullScreenContent');
            if (mediaListItems.length === 0 || currentMediaIndex < 0) return;

            const card = mediaListItems[currentMediaIndex];
            renderFullScreenActionRail(card);
            const img = card.querySelector('img');
            const video = card.querySelector('video');

            container.innerHTML = '';

            if (img) {
                const newImg = document.createElement('img');
                newImg.src = img.src;
                newImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                container.appendChild(newImg);
            } else if (video) {
                const source = video.querySelector('source');
                const videoSrc = source ? source.src : video.src;

                const newVideo = document.createElement('video');
                newVideo.src = videoSrc;
                newVideo.controls = true;
                newVideo.autoplay = true;
                newVideo.playsInline = true;
                newVideo.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                container.appendChild(newVideo);
            }
        }
        let isMarketOpen = false;

        function toggleMarketPage() {
            setHomeFeedFloatingActionsVisible(false);
            const marketPage = document.getElementById('marketMatrixPage');
            const socialPage = document.getElementById('socialMediaPage');
            const header = document.getElementById('mainHeader');
            const marketBtn = document.getElementById('marketFooterBtn');

            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('socialFeed').classList.remove('matrix-grid');
            document.querySelectorAll('#socialFeed .social-post-card').forEach(post => post.style.display = 'flex');

            // Close any open profile views
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';

            // Set market open state to true
            isMarketOpen = true;
            marketPage.style.display = 'flex';
            socialPage.style.display = 'none';
            header.classList.add('hidden');

            // Highlight Market in footer
            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            marketBtn.classList.add('active');

            window.scrollTo(0, 0);
        }

        function openMarketCategory(type, title) {
            setHomeFeedFloatingActionsVisible(false);
            const socialPage = document.getElementById('socialMediaPage');
            const feed = document.getElementById('socialFeed');
            const categoryHeader = document.getElementById('spaceCategoryHeader');

            activeView = 'home';
            isMarketOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';
            socialPage.style.display = 'flex';
            document.getElementById('mainHeader').classList.add('hidden');
            categoryHeader.style.display = 'flex';
            document.getElementById('spaceCategoryTitle').textContent = title;
            feed.classList.remove('matrix-grid');

            const posts = [...feed.querySelectorAll('.social-post-card')];
            posts.forEach(post => {
                post.style.display = post.dataset.type === type ? 'flex' : 'none';
            });

            let emptyMessage = document.getElementById('spaceCategoryEmpty');
            if (!emptyMessage) {
                emptyMessage = document.createElement('p');
                emptyMessage.id = 'spaceCategoryEmpty';
                emptyMessage.style.cssText = 'padding:24px 16px;color:#aaa;text-align:center;';
                feed.after(emptyMessage);
            }
            emptyMessage.textContent = posts.some(post => post.dataset.type === type) ? '' : `No ${title.toLowerCase()} posts yet.`;
            emptyMessage.style.display = posts.some(post => post.dataset.type === type) ? 'none' : 'block';
            feed.style.display = 'flex';
            document.querySelector('.fixed-footer').style.display = 'flex';
            window.scrollTo(0, 0);
        }

        function returnToSpaceCategories() {
            setHomeFeedFloatingActionsVisible(false);
            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            document.getElementById('socialMediaPage').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'flex';
            document.getElementById('mainHeader').classList.add('hidden');
            document.getElementById('socialFeed').querySelectorAll('.social-post-card').forEach(post => post.style.display = 'flex');
            document.querySelector('.fixed-footer').style.display = 'flex';
            isMarketOpen = true;
            window.scrollTo(0, 0);
        }

        // ── USER PROFILE TAB FILTERING ──
        function filterUserTab(type, element) {
            document.querySelectorAll('#userFeedSection .profile-tab-btn').forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const userFeed = document.getElementById('userFeed');
            if (!userFeed) return;

            const posts = userFeed.querySelectorAll('.social-post-card');

            if (type !== 'all') {
                userFeed.classList.add('matrix-grid');
            } else {
                userFeed.classList.remove('matrix-grid');
            }

            posts.forEach(post => {
                const postType = post.getAttribute('data-type');
                if (type === 'all' || postType === type) {
                    post.style.display = 'flex';
                } else {
                    post.style.display = 'none';
                }
            });

            bindMatrixClickHandlers(userFeed);
        }



        // ── TOGGLE MEDIA VIEW BETWEEN MATRIX GRID AND ORIGINAL CARDS ──
        function showOriginalMediaCards(mediaType) {
            let activeFeed;
            if (activeView === 'user') {
                activeFeed = document.getElementById('userFeed');
            } else if (activeView === 'company') {
                activeFeed = document.getElementById('softwareSection').style.display !== 'none' ?
                    document.getElementById('softwareFeed') :
                    document.getElementById('edutechFeed');
            } else {
                activeFeed = document.getElementById('socialFeed');
            }

            if (!activeFeed) return;

            activeFeed.querySelectorAll('.social-post-card').forEach(post => {
                const postType = post.getAttribute('data-type');
                if (postType === mediaType) {
                    post.style.display = 'flex';
                } else {
                    post.style.display = 'none';
                }
            });

            if (activeFeed.classList.contains('matrix-grid')) {
                activeFeed.classList.remove('matrix-grid');
            } else {
                activeFeed.classList.add('matrix-grid');
            }

            bindMatrixClickHandlers(activeFeed);
        }

        function toggleUserPageFromMarket() {
            isMarketOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'flex';
            toggleUserPage();
        }

        function toggleCompanyPageFromMarket() {
            isMarketOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'flex';
            toggleCompanyPage();
        }

        let currentMediaIndex = 0;
        let mediaListItems = [];
        let touchStartY = 0;

        function openFullScreenViewer(clickedCard) {
            let activeFeed = clickedCard.closest('.social-feed');
            if (!activeFeed && activeView === 'user') {
                activeFeed = document.getElementById('userFeed');
            } else if (!activeFeed && activeView === 'company') {
                activeFeed = document.getElementById('softwareSection').style.display !== 'none' ?
                    document.getElementById('softwareFeed') :
                    document.getElementById('edutechFeed');
            } else if (!activeFeed) {
                activeFeed = document.getElementById('socialFeed');
            }

            if (!activeFeed) return;

            mediaListItems = Array.from(activeFeed.querySelectorAll('.social-post-card')).filter(card => card.style.display !== 'none');
            currentMediaIndex = mediaListItems.indexOf(clickedCard);

            if (currentMediaIndex < 0 && mediaListItems.length > 0) {
                currentMediaIndex = 0;
            }

            renderFullScreenMedia();

            const viewer = document.getElementById('fullScreenViewer');
            viewer.style.display = 'flex';

            // Attach clean touch and wheel listeners directly when open
            viewer.ontouchstart = (e) => {
                touchStartY = e.touches[0].clientY;
            };

            viewer.ontouchend = (e) => {
                let touchEndY = e.changedTouches[0].clientY;
                let diff = touchStartY - touchEndY;

                if (diff > 40) {
                    // Swiped Up -> Next item
                    nextMediaItem();
                } else if (diff < -40) {
                    // Swiped Down -> Previous item or close
                    prevMediaItem();
                }
            };
        }

        function nextMediaItem() {
            if (currentMediaIndex < mediaListItems.length - 1) {
                currentMediaIndex++;
                renderFullScreenMedia();
            }
        }

        function prevMediaItem() {
            if (currentMediaIndex > 0) {
                currentMediaIndex--;
                renderFullScreenMedia();
            } else {
                closeFullScreenViewer();
            }
        }

        function renderFullScreenMedia() {
            const container = document.getElementById('fullScreenContent');
            if (mediaListItems.length === 0 || currentMediaIndex < 0) return;

            const card = mediaListItems[currentMediaIndex];
            renderFullScreenActionRail(card);
            const img = card.querySelector('img');
            const video = card.querySelector('video');

            container.innerHTML = '';

            if (img) {
                const newImg = document.createElement('img');
                newImg.src = img.src;
                newImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                container.appendChild(newImg);
            } else if (video) {
                const newVideo = document.createElement('video');
                const source = video.querySelector('source');
                newVideo.src = source ? source.src : video.src;
                newVideo.controls = true;
                newVideo.autoplay = true;
                newVideo.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                container.appendChild(newVideo);
            }
        }

        function renderFullScreenActionRail(post) {
            const rail = document.getElementById('fullScreenActionRail');
            rail.replaceChildren();
            if (!post) return;

            const sourceButtons = post.querySelectorAll('.post-actions .action-group-left .action-btn');
            sourceButtons.forEach(sourceButton => {
                const floatingButton = sourceButton.cloneNode(true);
                floatingButton.removeAttribute('onclick');
                floatingButton.setAttribute('aria-label', sourceButton.getAttribute('aria-label') ||
                    sourceButton.querySelector('i')?.className || sourceButton.querySelector('svg')?.getAttribute('data-icon') ||
                    sourceButton.textContent.trim() || 'Post action');
                floatingButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    sourceButton.click();
                    requestAnimationFrame(() => {
                        if (mediaListItems[currentMediaIndex] === post) renderFullScreenActionRail(post);
                    });
                });
                rail.appendChild(floatingButton);
            });

            rail.ontouchstart = event => event.stopPropagation();
            rail.ontouchend = event => event.stopPropagation();
        }

        function closeFullScreenViewer() {
            const viewer = document.getElementById('fullScreenViewer');
            viewer.style.display = 'none';
            document.getElementById('fullScreenContent').innerHTML = '';
            document.getElementById('fullScreenActionRail').replaceChildren();
        }

        // Global Mouse Wheel Listener for Desktop
        window.addEventListener('wheel', (e) => {
            const viewer = document.getElementById('fullScreenViewer');
            if (viewer && viewer.style.display === 'flex') {
                e.preventDefault(); // Prevent background body scroll
                if (e.deltaY > 0) {
                    nextMediaItem();
                } else {
                    prevMediaItem();
                }
            }
        }, {
            passive: false
        });

        function filterJobsFeed(element) {
            setHomeFeedFloatingActionsVisible(false);
            if (document.getElementById('spaceCategoryHeader').style.display !== 'none') {
                document.getElementById('spaceCategoryHeader').style.display = 'none';
                document.getElementById('spaceCategoryEmpty')?.remove();
                document.getElementById('mainHeader').classList.remove('hidden');
                document.getElementById('marketMatrixPage').style.display = 'none';
                isMarketOpen = false;
            }

            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            if (element) element.classList.add('active');

            // Close profile containers if open
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';
            document.getElementById('socialFeed').style.display = 'flex';

            // Hide header change-view icons since jobs are shown as direct posts
            document.getElementById('imageHeaderIcon').style.display = 'none';
            document.getElementById('videoHeaderIcon').style.display = 'none';

            let activeFeedSelector = '#socialFeed';
            if (activeView === 'user') {
                activeFeedSelector = '#userFeed';
            } else if (activeView === 'company') {
                activeFeedSelector = document.getElementById('softwareSection').style.display !== 'none' ?
                    '#softwareFeed' :
                    '#edutechFeed';
            }

            const feedContainer = document.querySelector(activeFeedSelector);
            if (!feedContainer) return;

            // REMOVE matrix-grid class so it stays as original full cards
            feedContainer.classList.remove('matrix-grid');

            const posts = feedContainer.querySelectorAll('.social-post-card');
            posts.forEach(post => {
                const postType = post.getAttribute('data-type');
                if (postType === 'job') {
                    post.style.display = 'flex';
                } else {
                    post.style.display = 'none';
                }
            });

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        // Open & Close Modal Handlers
        let editingSocialPostCard = null;

        function openPostCreatorModal() {
            editingSocialPostCard = null;
            document.getElementById('newPostType').disabled = false;
            document.getElementById('submitSocialPostButton').textContent = 'Publish Post';
            document.getElementById('postCreatorModal').style.display = 'flex';
        }

        function closePostCreatorModal() {
            document.getElementById('postCreatorModal').style.display = 'none';
            editingSocialPostCard = null;
            document.getElementById('newPostType').disabled = false;
            document.getElementById('submitSocialPostButton').textContent = 'Publish Post';
        }

        function editSocialPost(button) {
            const post = button.closest('.social-post-card');
            if (!post || !['service', 'product', 'vacancy'].includes(post.dataset.type)) return;

            editingSocialPostCard = post;
            document.getElementById('newPostType').value = post.dataset.type;
            document.getElementById('newPostType').disabled = true;
            document.getElementById('newPostAuthor').value = post.dataset.postAuthor || '';
            document.getElementById('newPostText').value = post.dataset.postCaption || '';
            document.getElementById('newPostMediaUrl').value = post.dataset.postMediaUrl || '';
            document.getElementById('submitSocialPostButton').textContent = 'Save Changes';
            document.getElementById('postCreatorModal').style.display = 'flex';
        }

        function getSocialPostMediaHtml(type, mediaUrl) {
            const safeUrl = mediaUrl ? escapeHtml(mediaUrl) : '';
            if (!safeUrl) return '';
            if (type === 'video') {
                return `<div class="post-media-container"><video src="${safeUrl}" controls playsinline></video></div>`;
            }
            if (type === 'audio') {
                return `<div class="post-media-container" style="padding: 15px;"><audio src="${safeUrl}" controls style="width:100%;"></audio></div>`;
            }
            if (type === 'file') {
                return `<div class="post-media-container" style="padding: 15px; background: rgba(255,255,255,0.05); text-align: center;"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color: #00f0ff; text-decoration: none; font-weight: bold;"><i class="fa-solid fa-file-arrow-down"></i> Download Attached File</a></div>`;
            }
            return `<div class="post-media-container"><img src="${safeUrl}" alt="Post Media"></div>`;
        }

        function getCategoryTitle(type) {
            const titles = {
                service: 'Service',
                product: 'Product',
                vacancy: 'Vacancy',
                work: 'Works',
                join: 'Join',
                hire: 'Hire',
                marketing: 'Marketing',
                freelancing: 'Freelancing',
                ads: 'Ads',
                payments: 'Payments'
            };
            return titles[type] || type;
        }

        function buildSocialPostCard(type, author, text, mediaUrl) {
            const initials = author.split(/\s+/).filter(Boolean).map(name => name[0]).join('').toUpperCase().substring(0, 2) || 'U';
            const newCard = document.createElement('div');
            newCard.className = 'social-post-card';
            newCard.dataset.type = type === 'job' ? 'job' : (type === 'audio' || type === 'file' ? 'image' : type);
            newCard.dataset.postType = type;
            newCard.dataset.postAuthor = author;
            newCard.dataset.postCaption = text;
            newCard.dataset.postMediaUrl = mediaUrl;
            const categoryLabel = ['service', 'product', 'vacancy'].includes(type) ?
                `<span style="font-size:0.7rem;color:#00f0ff;">#${escapeHtml(type)}</span>` :
                (type === 'job' ? '<span style="font-size:0.7rem;color:#00f0ff;">#jobrelated</span>' : '');
            const editButton = ['service', 'product', 'vacancy'].includes(type) ?
                '<button type="button" class="social-post-edit-btn" onclick="editSocialPost(this)">Edit</button>' : '';

            newCard.innerHTML = `
                <div class="post-header">
                    <div class="post-avatar" style="background: linear-gradient(135deg, #00ff66, #00f0ff);">${escapeHtml(initials)}</div>
                    <div class="post-author-info">
                        <h4>${escapeHtml(author)} ${categoryLabel}</h4>
                        <span>Just Now • 1 min read</span>
                    </div>
                    <button class="follow-btn" onclick="toggleFollow(this)">+ Follow</button>
                    ${editButton}
                </div>
                <p class="post-text">${escapeHtml(text)}</p>
                ${getSocialPostMediaHtml(type, mediaUrl)}
                <div class="post-actions">
                    <div class="action-group-left">
                        <button class="action-btn" onclick="toggleLike(this)"><i class="fa-regular fa-heart"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="alert('Opening comments...')"><i class="fa-regular fa-comment"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="openShareModal()"><i class="fa-regular fa-paper-plane"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="toggleRepost(this)"><i class="fa-solid fa-retweet"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="toggleBookmark(this)"><i class="fa-regular fa-bookmark"></i></button>
                    </div>
                    <button class="action-btn" onclick="alert('Downloading...')"><i class="fa-solid fa-download" style="font-size: 1.1rem;"></i></button>
                </div>
            `;
            return newCard;
        }

        // Build and Insert New Social Post Card Dynamically
        function submitNewSocialPost() {
            const type = document.getElementById('newPostType').value;
            const author = document.getElementById('newPostAuthor').value.trim() || 'User';
            const text = document.getElementById('newPostText').value.trim();
            const mediaUrl = document.getElementById('newPostMediaUrl').value.trim();
            if (!text && !mediaUrl) {
                document.getElementById('newPostText').focus();
                return;
            }
            if (mediaUrl) {
                try {
                    const parsedMediaUrl = new URL(mediaUrl);
                    if (!['http:', 'https:'].includes(parsedMediaUrl.protocol)) throw new Error('Unsupported media URL protocol');
                } catch {
                    alert('Enter a valid http or https media URL.');
                    document.getElementById('newPostMediaUrl').focus();
                    return;
                }
            }

            const postType = type === 'job' ? 'job' : (type === 'audio' || type === 'file' ? 'image' : type);
            if (editingSocialPostCard) {
                const post = editingSocialPostCard;
                post.dataset.postAuthor = author;
                post.dataset.postCaption = text;
                post.dataset.postMediaUrl = mediaUrl;
                post.querySelector('.post-avatar').textContent = author.split(/\s+/).filter(Boolean).map(name => name[0]).join('').toUpperCase().substring(0, 2) || 'U';
                post.querySelector('.post-author-info h4').innerHTML = `${escapeHtml(author)} <span style="font-size:0.7rem;color:#00f0ff;">#${escapeHtml(type)}</span>`;
                post.querySelector('.post-text').textContent = text;
                post.querySelector('.post-media-container')?.remove();
                const mediaHtml = getSocialPostMediaHtml(type, mediaUrl);
                if (mediaHtml) post.querySelector('.post-actions').insertAdjacentHTML('beforebegin', mediaHtml);

                const listing = Array.from(document.querySelectorAll('.item-card[data-business-listing-id]'))
                    .find(card => card.dataset.businessListingId === post.dataset.businessListingId);
                if (listing) {
                    const title = text.split(/\r?\n/)[0].slice(0, 60) || `${getCategoryTitle(type)} by ${author}`;
                    const subtitle = `${getCategoryTitle(type)} • Added from home`;
                    const image = mediaUrl || listing.querySelector('.item-card-img').src;
                    syncBusinessListingEdit(listing, type, title, subtitle, text, image, false);
                }
            } else {
                const newCard = buildSocialPostCard(type, author, text, mediaUrl);
                const feedContainer = document.getElementById('socialFeed');
                feedContainer.prepend(newCard);

                if (['service', 'product', 'vacancy'].includes(type)) {
                    const title = text.split(/\r?\n/)[0].slice(0, 60) || `${getCategoryTitle(type)} by ${author}`;
                    const subtitle = `${getCategoryTitle(type)} • Added from home`;
                    const placeholderImage = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
                    newCard.dataset.businessListingId = addBusinessListing(type, title, subtitle, text, mediaUrl || placeholderImage);
                }
            }

            activeView = 'home';
            isMarketOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('visitorFeedPage').style.display = 'none';
            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            document.getElementById('socialMediaPage').style.display = 'flex';
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';
            document.getElementById('socialFeed').classList.remove('matrix-grid');
            document.getElementById('socialFeed').querySelectorAll('.social-post-card').forEach(post => post.style.display = 'flex');
            document.getElementById('socialFeed').style.display = 'flex';
            document.getElementById('mainHeader').classList.remove('hidden');
            document.querySelector('.fixed-footer').style.display = 'flex';

            editingSocialPostCard = null;
            document.getElementById('newPostType').disabled = false;
            document.getElementById('submitSocialPostButton').textContent = 'Publish Post';
            document.getElementById('newPostText').value = '';
            document.getElementById('newPostMediaUrl').value = '';
            closePostCreatorModal();
            window.scrollTo(0, 0);
        }

        // ── PRODUCTS HUB INTEGRATION SCRIPT ──
        let productUploadedImgUrl = '';
        let currentEditingProductCard = null;

        function escapeHtml(value) {
            const element = document.createElement('span');
            element.textContent = String(value);
            return element.innerHTML;
        }

        function openProductHub() {
            document.getElementById('productHubOverlay').style.display = 'block';
            document.getElementById('marketMatrixPage').style.display = 'none';
            window.scrollTo(0, 0);
        }

        function closeProductHub() {
            document.getElementById('productHubOverlay').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'flex';
        }

        function handleTopAddButtonClick() {
            currentEditingProductCard = null;
            productUploadedImgUrl = '';

            const titleText = document.getElementById('product-modal-title-text');
            const submitBtn = document.getElementById('product-modal-submit-btn');
            const container = document.getElementById('product-dynamic-form-fields');

            submitBtn.innerText = 'Add Product';
            titleText.innerText = 'Add New Product';

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Product Name / Title</label>
                <input type="text" id="p-field-1" placeholder="Enter product name..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value Only (e.g. 4,500)</label>
                <input type="text" id="p-field-2" placeholder="4,500" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label>
                <textarea id="p-field-3" rows="3" placeholder="Enter product details..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleProductImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('product-add-modal').style.display = 'flex';
        }

        function handleProductImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                productUploadedImgUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function closeProductAddModal() {
            document.getElementById('product-add-modal').style.display = 'none';
        }

        function submitNewProductItem() {
            const val1 = document.getElementById('p-field-1').value.trim();
            const val2 = document.getElementById('p-field-2').value.trim();
            const val3 = document.getElementById('p-field-3').value.trim();

            if (!val1) {
                alert('Please fill out the product name.');
                return;
            }

            const title = val1;
            const costVal = val2 ? val2 : 'COST';
            const sub = `Product • ₹${costVal}`;
            const desc = val3 || 'No description added.';
            const defaultImg = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
            const img = productUploadedImgUrl || defaultImg;

            if (currentEditingProductCard) {
                currentEditingProductCard.setAttribute('data-title', title.toLowerCase());
                currentEditingProductCard.querySelector('.item-title').innerText = title;
                currentEditingProductCard.querySelector('.item-sub').innerText = sub;
                if (productUploadedImgUrl) {
                    currentEditingProductCard.querySelector('.item-card-img').src = productUploadedImgUrl;
                }
                currentEditingProductCard.onclick = function() {
                    openItemDetails(title, sub, desc, productUploadedImgUrl || currentEditingProductCard.querySelector('.item-card-img').src);
                };
                syncBusinessListingEdit(currentEditingProductCard, 'product', title, sub, desc, productUploadedImgUrl || currentEditingProductCard.querySelector('.item-card-img').src);
            } else {
                addBusinessListing('product', title, sub, desc, img);
            }

            closeProductAddModal();
            filterProductItems();
        }

        function openEditCardModal(e, btn) {
            e.stopPropagation();
            currentEditingProductCard = btn.closest('.item-card');

            const titleText = document.getElementById('product-modal-title-text');
            const submitBtn = document.getElementById('product-modal-submit-btn');
            const container = document.getElementById('product-dynamic-form-fields');

            titleText.innerText = 'Edit Product';
            submitBtn.innerText = 'Save Changes';

            const currentTitle = currentEditingProductCard.querySelector('.item-title').innerText;
            const currentSub = currentEditingProductCard.querySelector('.item-sub').innerText;

            let currentCostVal = currentSub.replace(/^Product • ₹/i, '');
            if (currentCostVal === 'COST') currentCostVal = '';

            const currentImg = currentEditingProductCard.querySelector('.item-card-img').src;
            productUploadedImgUrl = currentImg;

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Product Name</label>
                <input type="text" id="p-field-1" value="${escapeHtml(currentTitle)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value Only (e.g. 4,500)</label>
                <input type="text" id="p-field-2" value="${escapeHtml(currentCostVal)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label>
                <textarea id="p-field-3" rows="3" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">${escapeHtml(currentEditingProductCard.dataset.description || 'Update details...')}</textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85font; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Replace Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleProductImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('product-add-modal').style.display = 'flex';
        }

        function openItemDetails(title, sub, description, imgUrl = '') {
            document.getElementById('product-detail-item-title').innerText = title;
            document.getElementById('product-detail-item-sub').innerText = sub;
            document.getElementById('product-detail-item-desc').innerText = description;
            const imgContainer = document.getElementById('product-detail-img-container');
            const imgElement = document.getElementById('product-detail-item-img');

            if (imgUrl) {
                imgElement.src = imgUrl;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }

            document.getElementById('product-item-detail-page').style.display = 'block';
        }

        function closeProductItemDetails() {
            document.getElementById('product-item-detail-page').style.display = 'none';
        }

        function filterProductItems() {
            const query = document.getElementById('product-search-input').value.toLowerCase().trim();
            document.querySelectorAll('#all-product-list .item-card').forEach(card => {
                const title = card.getAttribute('data-title');
                card.style.display = (!query || (title && title.includes(query))) ? 'flex' : 'none';
            });
        }

        // ── SERVICES HUB INTEGRATION SCRIPT ──
        let serviceUploadedImgUrl = '';
        let currentEditingServiceCard = null;

        function openServiceHub() {
            document.getElementById('serviceHubOverlay').style.display = 'block';
            document.getElementById('marketMatrixPage').style.display = 'none';
            window.scrollTo(0, 0);
        }

        function closeServiceHub() {
            document.getElementById('serviceHubOverlay').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'flex';
        }

        function handleServiceTopAddButtonClick() {
            currentEditingServiceCard = null;
            serviceUploadedImgUrl = '';

            const titleText = document.getElementById('service-modal-title-text');
            const submitBtn = document.getElementById('service-modal-submit-btn');
            const container = document.getElementById('service-dynamic-form-fields');

            submitBtn.innerText = 'Save Entry';
            titleText.innerText = 'Add New Service';

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Service Name / Title</label>
                <input type="text" id="s-field-1" placeholder="Enter service name..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value / Subtext (e.g. ₹COST)</label>
                <input type="text" id="s-field-2" placeholder="Product • ₹COST" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label>
                <textarea id="s-field-3" rows="3" placeholder="Enter service details..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleServiceImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('service-add-modal').style.display = 'flex';
        }

        function handleServiceImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                serviceUploadedImgUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function closeServiceAddModal() {
            document.getElementById('service-add-modal').style.display = 'none';
        }

        function submitNewServiceItem() {
            const val1 = document.getElementById('s-field-1').value.trim();
            const val2 = document.getElementById('s-field-2').value.trim();
            const val3 = document.getElementById('s-field-3').value.trim();

            if (!val1) {
                alert('Please fill out the service name.');
                return;
            }

            const title = val1;
            const sub = val2 ? val2 : 'Service';
            const desc = val3 || 'No description added.';
            const defaultImg = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=500&q=80';
            const img = serviceUploadedImgUrl || defaultImg;

            if (currentEditingServiceCard) {
                currentEditingServiceCard.setAttribute('data-title', title.toLowerCase());
                currentEditingServiceCard.querySelector('.item-title').innerText = title;
                currentEditingServiceCard.querySelector('.item-sub').innerText = sub;
                if (serviceUploadedImgUrl) {
                    currentEditingServiceCard.querySelector('.item-card-img').src = serviceUploadedImgUrl;
                }
                currentEditingServiceCard.onclick = function() {
                    openServiceItemDetails(title, sub, desc, serviceUploadedImgUrl || currentEditingServiceCard.querySelector('.item-card-img').src);
                };
                syncBusinessListingEdit(currentEditingServiceCard, 'service', title, sub, desc, serviceUploadedImgUrl || currentEditingServiceCard.querySelector('.item-card-img').src);
            } else {
                addBusinessListing('service', title, sub, desc, img);
            }

            closeServiceAddModal();
            filterServiceItems();
        }

        function openServiceEditCardModal(e, btn) {
            e.stopPropagation();
            currentEditingServiceCard = btn.closest('.item-card');

            const titleText = document.getElementById('service-modal-title-text');
            const submitBtn = document.getElementById('service-modal-submit-btn');
            const container = document.getElementById('service-dynamic-form-fields');

            titleText.innerText = 'Edit Service';
            submitBtn.innerText = 'Save Changes';

            const currentTitle = currentEditingServiceCard.querySelector('.item-title').innerText;
            const currentSub = currentEditingServiceCard.querySelector('.item-sub').innerText;
            const currentImg = currentEditingServiceCard.querySelector('.item-card-img').src;
            serviceUploadedImgUrl = currentImg;

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Service Name</label>
                <input type="text" id="s-field-1" value="${escapeHtml(currentTitle)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value / Subtext</label>
                <input type="text" id="s-field-2" value="${escapeHtml(currentSub)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label>
                <textarea id="s-field-3" rows="3" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">${escapeHtml(currentEditingServiceCard.dataset.description || 'Update details...')}</textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Replace Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleServiceImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('service-add-modal').style.display = 'flex';
        }

        function openServiceItemDetails(title, sub, description, imgUrl = '') {
            document.getElementById('service-detail-item-title').innerText = title;
            document.getElementById('service-detail-item-sub').innerText = sub;
            document.getElementById('service-detail-item-desc').innerText = description;
            const imgContainer = document.getElementById('service-detail-img-container');
            const imgElement = document.getElementById('service-detail-item-img');

            if (imgUrl) {
                imgElement.src = imgUrl;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }

            document.getElementById('service-item-detail-page').style.display = 'block';
        }

        function closeServiceItemDetails() {
            document.getElementById('service-item-detail-page').style.display = 'none';
        }

        function filterServiceItems() {
            const query = document.getElementById('service-search-input').value.toLowerCase().trim();
            document.querySelectorAll('#all-services-list .item-card').forEach(card => {
                const title = card.getAttribute('data-title');
                card.style.display = (!query || (title && title.includes(query))) ? 'flex' : 'none';
            });
        }

        // ── VACANCIES HUB INTEGRATION SCRIPT ──
        let vacancyUploadedImgUrl = '';
        let currentEditingVacancyCard = null;

        function openVacancyHub() {
            document.getElementById('vacancyHubOverlay').style.display = 'block';
            document.getElementById('marketMatrixPage').style.display = 'none';
            window.scrollTo(0, 0);
        }

        function closeVacancyHub() {
            document.getElementById('vacancyHubOverlay').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'flex';
        }

        function handleVacancyTopAddButtonClick() {
            currentEditingVacancyCard = null;
            vacancyUploadedImgUrl = '';

            const titleText = document.getElementById('vacancy-modal-title-text');
            const submitBtn = document.getElementById('vacancy-modal-submit-btn');
            const container = document.getElementById('vacancy-dynamic-form-fields');

            submitBtn.innerText = 'Save Entry';
            titleText.innerText = 'Add New Vacancy';

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Job Title / Role</label>
                <input type="text" id="v-field-1" placeholder="e.g. Store Helper" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value Only (e.g. 12,000)</label>
                <input type="text" id="v-field-2" placeholder="12,000" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description & Eligibility</label>
                <textarea id="v-field-3" rows="3" placeholder="Enter vacancy details..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleVacancyImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('vacancy-add-modal').style.display = 'flex';
        }

        function handleVacancyImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                vacancyUploadedImgUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function closeVacancyAddModal() {
            document.getElementById('vacancy-add-modal').style.display = 'none';
        }

        function submitNewVacancyItem() {
            const val1 = document.getElementById('v-field-1').value.trim();
            const val2 = document.getElementById('v-field-2').value.trim();
            const val3 = document.getElementById('v-field-3').value.trim();

            if (!val1) {
                alert('Please fill out the job title.');
                return;
            }

            const title = val1;
            const costVal = val2 ? val2 : 'COST';
            const sub = `Salary: ₹${costVal.replace(/^₹\s*/, '').replace(/\s*\/\s*month$/i, '')} / month`;
            const desc = val3 || 'No description added.';
            const defaultImg = 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=500&q=80';
            const img = vacancyUploadedImgUrl || defaultImg;

            if (currentEditingVacancyCard) {
                currentEditingVacancyCard.setAttribute('data-title', title.toLowerCase());
                currentEditingVacancyCard.querySelector('.item-title').innerText = title;
                currentEditingVacancyCard.querySelector('.item-sub').innerText = sub;
                if (vacancyUploadedImgUrl) {
                    currentEditingVacancyCard.querySelector('.item-card-img').src = vacancyUploadedImgUrl;
                }
                currentEditingVacancyCard.onclick = function() {
                    openVacancyItemDetails(title, sub, desc, vacancyUploadedImgUrl || currentEditingVacancyCard.querySelector('.item-card-img').src);
                };
                syncBusinessListingEdit(currentEditingVacancyCard, 'vacancy', title, sub, desc, vacancyUploadedImgUrl || currentEditingVacancyCard.querySelector('.item-card-img').src);
            } else {
                addBusinessListing('vacancy', title, sub, desc, img);
            }

            closeVacancyAddModal();
            filterVacancyItems();
        }

        function openVacancyEditCardModal(e, btn) {
            e.stopPropagation();
            currentEditingVacancyCard = btn.closest('.item-card');

            const titleText = document.getElementById('vacancy-modal-title-text');
            const submitBtn = document.getElementById('vacancy-modal-submit-btn');
            const container = document.getElementById('vacancy-dynamic-form-fields');

            titleText.innerText = 'Edit Vacancy';
            submitBtn.innerText = 'Save Changes';

            const currentTitle = currentEditingVacancyCard.querySelector('.item-title').innerText;
            const currentSub = currentEditingVacancyCard.querySelector('.item-sub').innerText;

            let currentCostVal = currentSub
                .replace(/^Salary:\s*/i, '')
                .replace(/^₹/, '')
                .replace(/\s*\/\s*month$/i, '');
            if (currentCostVal === 'COST') currentCostVal = '';

            const currentImg = currentEditingVacancyCard.querySelector('.item-card-img').src;
            vacancyUploadedImgUrl = currentImg;

            container.innerHTML = `
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Job Title / Role</label>
                <input type="text" id="v-field-1" value="${escapeHtml(currentTitle)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Cost Value Only (e.g. 12,000)</label>
                <input type="text" id="v-field-2" value="${escapeHtml(currentCostVal)}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description & Eligibility</label>
                <textarea id="v-field-3" rows="3" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">${escapeHtml(currentEditingVacancyCard.dataset.description || 'Update details...')}</textarea>
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Replace Image (Optional)</label>
                <input type="file" accept="image/*" onchange="handleVacancyImageUpload(event)" style="width:100%; color:#fff;">
            </div>
        `;

            document.getElementById('vacancy-add-modal').style.display = 'flex';
        }

        function openVacancyItemDetails(title, sub, description, imgUrl = '') {
            document.getElementById('vacancy-detail-item-title').innerText = title;
            document.getElementById('vacancy-detail-item-sub').innerText = sub;
            document.getElementById('vacancy-detail-item-desc').innerText = description;
            const imgContainer = document.getElementById('vacancy-detail-img-container');
            const imgElement = document.getElementById('vacancy-detail-item-img');

            if (imgUrl) {
                imgElement.src = imgUrl;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }

            document.getElementById('vacancy-item-detail-page').style.display = 'block';
        }

        function closeVacancyItemDetails() {
            document.getElementById('vacancy-item-detail-page').style.display = 'none';
        }

        function filterVacancyItems() {
            const query = document.getElementById('vacancy-search-input').value.toLowerCase().trim();
            document.querySelectorAll('#all-vacancies-list .item-card').forEach(card => {
                const title = card.getAttribute('data-title');
                card.style.display = (!query || (title && title.includes(query))) ? 'flex' : 'none';
            });
        }

        /* Open the custom menu overlay when the user icon is clicked */
        function openUserMenuOverlay() {
            document.getElementById('userMenuOverlay').style.display = 'flex';
        }

        /* Close the custom menu overlay */
        function closeUserMenuOverlay() {
            document.getElementById('userMenuOverlay').style.display = 'none';
        }

        function openWorkerProfilePage() {
            const workerProfileFrame = document.getElementById('workerProfileFrame');
            if (!workerProfileFrame.hasAttribute('srcdoc')) {
                const workerProfileSource = document.getElementById('workerProfileDocumentSource').content.textContent;
                if (!workerProfileSource) {
                    console.error('Unable to open the worker profile: embedded page source is missing.');
                    return;
                }
                workerProfileFrame.srcdoc = workerProfileSource;
            }
            document.getElementById('workerProfileOverlay').style.display = 'block';
        }

        function closeWorkerProfilePage() {
            document.getElementById('workerProfileOverlay').style.display = 'none';
        }

        function initializeEditableProfileFeed(feed) {
            if (!feed) return;

            const mediaTypes = {
                image: {
                    accept: 'image/*',
                    prompt: 'Add an image to this post'
                },
                video: {
                    accept: 'video/*',
                    prompt: 'Add a video to this post'
                },
                audio: {
                    accept: 'audio/*',
                    prompt: 'Add an audio clip to this post'
                },
                file: {
                    accept: '',
                    prompt: 'Add a file to this post'
                }
            };

            feed.querySelectorAll('.social-post-card').forEach(card => {
                if (card.dataset.profileEditable === 'true') return;

                const type = card.dataset.type;
                const caption = card.querySelector('.post-text');
                if (caption) {
                    caption.textContent = '';
                    caption.classList.add('profile-feed-caption');
                    caption.contentEditable = 'true';
                    caption.setAttribute('role', 'textbox');
                    caption.setAttribute('aria-multiline', 'true');
                    caption.setAttribute('aria-label', 'Edit post text');
                    caption.dataset.placeholder = type === 'text' ? 'Write your post...' : 'Add a caption...';
                }

                if (mediaTypes[type]) {
                    let mediaContainer = card.querySelector('.post-media-container');
                    if (!mediaContainer) {
                        mediaContainer = document.createElement('div');
                        mediaContainer.className = 'post-media-container';
                        card.querySelector('.post-actions')?.before(mediaContainer);
                    }
                    mediaContainer.replaceChildren();
                    mediaContainer.removeAttribute('style');

                    const editor = document.createElement('div');
                    editor.className = 'profile-feed-media-editor';

                    const prompt = document.createElement('span');
                    prompt.className = 'profile-feed-media-prompt';
                    prompt.textContent = mediaTypes[type].prompt;

                    const uploadLabel = document.createElement('label');
                    uploadLabel.className = 'profile-feed-upload';
                    uploadLabel.textContent = `Choose ${type}`;

                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = mediaTypes[type].accept;
                    input.setAttribute('aria-label', `Choose ${type} for this post`);
                    input.className = 'profile-feed-media-input';
                    uploadLabel.appendChild(input);

                    const preview = document.createElement('div');
                    preview.className = 'profile-feed-media-preview';
                    preview.setAttribute('aria-live', 'polite');

                    editor.append(prompt, uploadLabel, preview);
                    mediaContainer.appendChild(editor);
                } else {
                    card.querySelector('.post-media-container')?.remove();
                }

                card.dataset.profileEditable = 'true';
            });

            if (!feed._profileFeedEditorBound) {
                feed.addEventListener('change', handleProfileFeedMediaSelection);
                feed._profileFeedEditorBound = true;
            }
        }

        function handleProfileFeedMediaSelection(event) {
            const input = event.target;
            if (!input || input.tagName !== 'INPUT' || !input.matches('.profile-feed-media-input')) return;

            const file = input.files?. [0];
            const preview = input.closest('.social-post-card')?.querySelector('.profile-feed-media-preview');
            if (!file || !preview) return;

            const mediaContainer = preview.closest('.post-media-container');
            if (mediaContainer?.dataset.previewUrl) {
                URL.revokeObjectURL(mediaContainer.dataset.previewUrl);
            }

            const url = URL.createObjectURL(file);
            if (mediaContainer) mediaContainer.dataset.previewUrl = url;
            preview.replaceChildren();

            if (input.closest('.social-post-card')?.dataset.type === 'file') {
                const link = document.createElement('a');
                link.href = url;
                link.download = file.name;
                link.textContent = file.name;
                link.style.cssText = 'display:block; padding:12px; color:#00f0ff; overflow-wrap:anywhere; text-decoration:none;';
                preview.appendChild(link);
                return;
            }

            const type = input.closest('.social-post-card')?.dataset.type;
            const media = input.ownerDocument.createElement(type === 'image' ? 'img' : type);
            media.src = url;
            if (type === 'image') {
                media.alt = file.name;
            } else {
                media.controls = true;
                if (type === 'video') media.playsInline = true;
            }
            preview.appendChild(media);
        }

        initializeEditableProfileFeed(document.getElementById('userFeed'));

        function openVisitorFeedPage() {
            setHomeFeedFloatingActionsVisible(false);
            const visitorContent = document.getElementById('visitorProfileContent');
            if (!visitorContent.hasChildNodes()) {
                const profileFeed = document.getElementById('userFeedSection').cloneNode(true);
                profileFeed.id = 'visitorUserFeedSection';

                const activity = profileFeed.querySelector('#userActivitySection');
                if (activity) activity.id = 'visitorActivitySection';

                const visitorFeed = profileFeed.querySelector('#userFeed');
                visitorFeed.id = 'visitorFeed';
                initializeEditableProfileFeed(visitorFeed);

                const activityTitle = profileFeed.querySelector('.profile-name-title');
                if (activityTitle && activityTitle.firstChild) {
                    activityTitle.firstChild.nodeValue = 'NAME';
                }

                const handle = profileFeed.querySelector('.profile-handle');
                if (handle) handle.textContent = '@username';

                profileFeed.querySelectorAll('.profile-tab-btn').forEach(button => {
                    const filter = button.getAttribute('onclick').match(/filterUserTab\('([^']+)'/);
                    if (filter) button.setAttribute('onclick', `filterVisitorTab('${filter[1]}', this)`);
                });

                profileFeed.querySelectorAll('.post-avatar').forEach(avatar => {
                    avatar.textContent = 'V';
                });

                profileFeed.querySelectorAll('.post-author-info h4').forEach(author => {
                    if (author.firstChild) author.firstChild.nodeValue = 'USER ';
                });

                visitorContent.appendChild(profileFeed);
            }

            closeUserMenuOverlay();
            closeAllInfoHub();
            activeView = 'visitor';
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'none';
            document.getElementById('visitorFeedPage').style.display = 'flex';
            document.querySelector('.fixed-footer').style.display = 'none';
            window.scrollTo(0, 0);
        }

        function closeVisitorFeedPage() {
            activeView = 'home';
            document.getElementById('visitorFeedPage').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'flex';
            document.getElementById('userProfilePage').style.display = 'none';
            document.getElementById('personalProfilePage').style.display = 'none';
            document.getElementById('socialFeed').style.display = 'flex';
            document.getElementById('mainHeader').classList.remove('hidden');
            document.querySelector('.fixed-footer').style.display = 'flex';
            window.scrollTo(0, 0);
        }

        function filterVisitorTab(type, element) {
            document.querySelectorAll('#visitorProfileContent .profile-tab-btn').forEach(button => button.classList.remove('active'));
            if (element) element.classList.add('active');

            const visitorFeed = document.getElementById('visitorFeed');
            if (!visitorFeed) return;

            visitorFeed.classList.toggle('matrix-grid', type !== 'all');
            visitorFeed.querySelectorAll('.social-post-card').forEach(post => {
                post.style.display = type === 'all' || post.getAttribute('data-type') === type ? 'flex' : 'none';
            });

            bindMatrixClickHandlers(visitorFeed);
        }

        /* Handle clicks on any of the option boxes in the menu layout */
        function selectUserMenuOption(actionType) {
            if (actionType === 'User Login') {
                openVisitorFeedPage();
                return;
            }

            if (actionType === 'Register Work') {
                setHomeFeedFloatingActionsVisible(false);
                closeUserMenuOverlay();
                closeAllInfoHub();
                openWorkerProfilePage();
                return;
            }

            if (actionType !== 'Register Business') return;

            setHomeFeedFloatingActionsVisible(false);
            // 1. Close the menu overlay
            closeUserMenuOverlay();
            closeAllInfoHub();

            // 2. Open your actual existing user feed / profile page
            // (This triggers your existing toggle logic to show the user profile & feed)
            const userPage = document.getElementById('userProfilePage');
            const companyPage = document.getElementById('personalProfilePage');
            const homeFeed = document.getElementById('socialFeed');
            const header = document.getElementById('mainHeader');
            const footer = document.querySelector('.fixed-footer');

            initializeEditableProfileFeed(document.getElementById('userFeed'));
            activeView = 'user';
            userPage.style.display = 'block';
            companyPage.style.display = 'none';
            homeFeed.style.display = 'none';
            footer.style.display = 'none';
            header.classList.add('hidden');
            window.scrollTo(0, 0);

            // Optional: Log or handle specific action types if needed
            console.log("Selected option:", actionType);
        }

        window.addEventListener('message', event => {
            const workerProfileFrame = document.getElementById('workerProfileFrame');
            if (event.source === workerProfileFrame.contentWindow && event.data === 'close-worker-profile') {
                closeWorkerProfilePage();
            }
        });

        // ===== BUSINESS PROFILE ORDER MANAGEMENT FUNCTIONS =====
        function handleOrderAccept() {
            const resultMsg = document.getElementById('order-result-msg');
            const actionBtns = document.getElementById('order-action-buttons');
            const statusEl = document.querySelector('#order-received-box .business-order-status');

            if (statusEl) {
                statusEl.textContent = 'Accepted';
                statusEl.style.color = '#81c784';
                statusEl.style.borderColor = '#2e7d32';
            }

            if (actionBtns) {
                actionBtns.style.display = 'none';
            }

            resultMsg.className = 'business-order-result-msg success';
            resultMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> Order Accepted successfully!';
            resultMsg.style.display = 'block';
        }

        function handleOrderDecline() {
            const resultMsg = document.getElementById('order-result-msg');
            const actionBtns = document.getElementById('order-action-buttons');
            const deliverySection = document.getElementById('delivery-boy-section');
            const statusEl = document.querySelector('#order-received-box .business-order-status');

            if (statusEl) {
                statusEl.textContent = 'Declined';
                statusEl.style.color = '#ef9a9a';
                statusEl.style.borderColor = '#c62828';
            }

            if (actionBtns) {
                actionBtns.style.display = 'none';
            }

            if (deliverySection) {
                deliverySection.style.display = 'none';
            }

            resultMsg.className = 'business-order-result-msg declined';
            resultMsg.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Order Declined.';
            resultMsg.style.display = 'block';
        }

        function handleDeliveryBoyChange() {
            const select = document.getElementById('delivery-boy-select');
            const connectBtn = document.getElementById('btn-connect-nearer');
            const resultMsg = document.getElementById('order-result-msg');

            if (select.value === 'no') {
                connectBtn.classList.add('visible');
                resultMsg.className = 'business-order-result-msg info';
                resultMsg.innerHTML = '<i class="fa-solid fa-info-circle"></i> No delivery boy available. Connect with a nearer one.';
                resultMsg.style.display = 'block';
            } else if (select.value === 'yes') {
                connectBtn.classList.remove('visible');
                resultMsg.className = 'business-order-result-msg success';
                resultMsg.innerHTML = '<i class="fa-solid fa-motorcycle"></i> Delivery boy is available for this order.';
                resultMsg.style.display = 'block';
            } else {
                connectBtn.classList.remove('visible');
                resultMsg.style.display = 'none';
            }
        }

        function connectNearerDeliveryBoy() {
            const resultMsg = document.getElementById('order-result-msg');
            const connectBtn = document.getElementById('btn-connect-nearer');
            const select = document.getElementById('delivery-boy-select');

            resultMsg.className = 'business-order-result-msg success';
            resultMsg.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Connected with nearer delivery boy (2.3 km away). Assigned successfully!';
            resultMsg.style.display = 'block';
            connectBtn.classList.remove('visible');
            select.value = 'yes';
            select.disabled = true;
        }

        function switchBusinessTab(tab, element) {
            // Update active button
            const businessFooterButtons = document.querySelectorAll('.business-footer-btn');
            businessFooterButtons.forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const homeContent = document.querySelector('#userInfoSection .business-profile-content-body');
            const staffSection = document.getElementById('businessStaffSection');
            const allItemsSection = document.getElementById('businessAllItemsSection');

            if (tab === 'home') {
                // Show home content (all business info cards)
                if (homeContent) {
                    const allCards = homeContent.querySelectorAll('.business-info-card');
                    allCards.forEach(card => card.style.display = 'block');
                }
                if (staffSection) staffSection.style.display = 'none';
                if (allItemsSection) allItemsSection.style.display = 'none';
            } else if (tab === 'staff') {
                // Hide home content, show staff section
                if (homeContent) {
                    const allCards = homeContent.querySelectorAll('.business-info-card');
                    allCards.forEach(card => card.style.display = 'none');
                }
                if (staffSection) staffSection.style.display = 'block';
                if (allItemsSection) allItemsSection.style.display = 'none';
            }
        }
        // ── ALL ITEMS / INFO HUB INTEGRATION SCRIPT ──
        let currentAllInfoTab = 'info-view-all';
        let allInfoUploadedImgUrl = '';
        let currentEditingAllInfoCard = null;
        let infoHubUserFeedPlaceholder = null;

        const businessListingViews = {
            product: {
                info: 'info-all-list',
                catalog: 'all-product-list',
                section: 'info-view-all'
            },
            service: {
                info: 'info-services-list',
                catalog: 'all-services-list',
                section: 'info-view-services'
            },
            vacancy: {
                info: 'info-vacancies-list',
                catalog: 'all-vacancies-list',
                section: 'info-view-vacancies'
            }
        };
        let nextBusinessListingId = 0;

        function createBusinessListingCard(type, entry, view) {
            const card = document.createElement('div');
            card.className = 'item-card';
            card.dataset.businessListingId = entry.id;
            card.dataset.description = entry.description;
            card.dataset.title = `${entry.title} ${entry.subtitle} ${entry.description}`.toLowerCase();
            card.style.cssText = 'background:#1e1e24;border-radius:10px;padding:12px;border:1px solid #2e2e38;display:flex;flex-direction:column;position:relative;cursor:pointer;';

            const editButton = document.createElement('button');
            editButton.className = 'card-edit-btn';
            editButton.type = 'button';
            editButton.setAttribute('aria-label', `Edit ${type}`);
            editButton.style.cssText = 'position:absolute;top:18px;right:18px;background:rgba(0,0,0,0.75);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:5;';
            editButton.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
            editButton.addEventListener('click', event => {
                event.stopPropagation();
                if (view === 'info') {
                    currentAllInfoTab = businessListingViews[type].section;
                    openAllInfoEditCardModal(event, editButton);
                } else if (type === 'product') {
                    openEditCardModal(event, editButton);
                } else if (type === 'service') {
                    openServiceEditCardModal(event, editButton);
                } else {
                    openVacancyEditCardModal(event, editButton);
                }
            });

            const image = document.createElement('img');
            image.className = 'item-card-img';
            image.alt = entry.title;
            image.src = entry.image;
            image.style.cssText = 'width:100%;height:130px;object-fit:cover;border-radius:8px;margin-bottom:10px;';

            const title = document.createElement('div');
            title.className = 'item-title';
            title.style.cssText = 'font-weight:bold;font-size:1rem;color:#fff;';
            title.textContent = entry.title;

            const subtitle = document.createElement('div');
            subtitle.className = 'item-sub';
            subtitle.style.cssText = 'font-size:0.85rem;color:#25d366;margin-top:4px;font-weight:600;';
            subtitle.textContent = entry.subtitle;

            if (view === 'info') card.append(editButton);
            card.append(image, title, subtitle);
            card.addEventListener('click', () => {
                const currentTitle = title.textContent;
                const currentSubtitle = subtitle.textContent;
                const currentImage = image.src;
                if (view === 'info') {
                    openAllInfoItemDetails(currentTitle, currentSubtitle, card.dataset.description, currentImage);
                } else if (type === 'product') {
                    openItemDetails(currentTitle, currentSubtitle, card.dataset.description, currentImage);
                } else if (type === 'service') {
                    openServiceItemDetails(currentTitle, currentSubtitle, card.dataset.description, currentImage);
                } else {
                    openVacancyItemDetails(currentTitle, currentSubtitle, card.dataset.description, currentImage);
                }
            });
            return card;
        }

        function addBusinessListing(type, title, subtitle, description, image) {
            const views = businessListingViews[type];
            if (!views) throw new Error(`Unknown business listing type: ${type}`);
            const entry = {
                id: `business-listing-${++nextBusinessListingId}`,
                title,
                subtitle,
                description,
                image
            };
            document.getElementById(views.info).appendChild(createBusinessListingCard(type, entry, 'info'));
            document.getElementById(views.catalog).appendChild(createBusinessListingCard(type, entry, 'catalog'));
            filterAllInfoItems();
            if (type === 'product') filterProductItems();
            else if (type === 'service') filterServiceItems();
            else filterVacancyItems();
            return entry.id;
        }

        function syncBusinessListingEdit(card, type, title, subtitle, description, image, syncHomePostMedia = true) {
            const id = card && card.dataset.businessListingId;
            if (!id) return;
            document.querySelectorAll(`.item-card[data-business-listing-id="${id}"]`).forEach(mirror => {
                mirror.dataset.description = description;
                mirror.dataset.title = `${title} ${subtitle} ${description}`.toLowerCase();
                mirror.querySelector('.item-title').textContent = title;
                mirror.querySelector('.item-sub').textContent = subtitle;
                mirror.querySelector('.item-card-img').src = image;
                mirror.querySelector('.item-card-img').alt = title;
            });

            const linkedPost = Array.from(document.querySelectorAll('#socialFeed .social-post-card[data-business-listing-id]'))
                .find(post => post.dataset.businessListingId === id);
            if (linkedPost) {
                linkedPost.dataset.postCaption = description;
                if (syncHomePostMedia) linkedPost.dataset.postMediaUrl = image;
                linkedPost.querySelector('.post-text').textContent = description;
                const postMediaUrl = linkedPost.dataset.postMediaUrl;
                if (!postMediaUrl) {
                    linkedPost.querySelector('.post-media-container')?.remove();
                } else {
                    let mediaContainer = linkedPost.querySelector('.post-media-container');
                    if (!mediaContainer) {
                        mediaContainer = document.createElement('div');
                        mediaContainer.className = 'post-media-container';
                        linkedPost.querySelector('.post-actions').before(mediaContainer);
                    }
                    let postImage = mediaContainer.querySelector('img');
                    if (!postImage) {
                        postImage = document.createElement('img');
                        postImage.alt = title;
                        mediaContainer.replaceChildren(postImage);
                    }
                    postImage.src = postMediaUrl;
                    postImage.alt = title;
                }
            }
            filterAllInfoItems();
            if (type === 'product') filterProductItems();
            else if (type === 'service') filterServiceItems();
            else filterVacancyItems();
        }

        function moveUserFeedToInfoHub() {
            const userFeedSection = document.getElementById('userFeedSection');
            const mainContainer = document.querySelector('#allInfoHubOverlay .main-container');

            if (!userFeedSection || !mainContainer) {
                console.error('Unable to move the user feed into the Info Hub: required element is missing.');
                return null;
            }

            if (!infoHubUserFeedPlaceholder) {
                infoHubUserFeedPlaceholder = document.createComment('userFeedSection original position');
                userFeedSection.parentNode.insertBefore(infoHubUserFeedPlaceholder, userFeedSection);
            }

            mainContainer.appendChild(userFeedSection);
            return userFeedSection;
        }

        function restoreUserFeedFromInfoHub() {
            const userFeedSection = document.getElementById('userFeedSection');
            if (userFeedSection && infoHubUserFeedPlaceholder && infoHubUserFeedPlaceholder.parentNode) {
                infoHubUserFeedPlaceholder.parentNode.insertBefore(userFeedSection, infoHubUserFeedPlaceholder);
                infoHubUserFeedPlaceholder.remove();
                infoHubUserFeedPlaceholder = null;
            }
        }

        function openAllInfoHub() {
            document.getElementById('allInfoHubOverlay').style.display = 'block';
            window.scrollTo(0, 0);
        }

        function closeAllInfoHub() {
            restoreUserFeedFromInfoHub();
            document.getElementById('allInfoHubOverlay').style.display = 'none';
        }

        function switchAllInfoTab(viewId, btnElement) {
            currentAllInfoTab = viewId;
            document.querySelectorAll('#allInfoHubOverlay .view-section').forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none';
            });
            document.querySelectorAll('#allInfoHubOverlay .footer-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.color = '#777788';
                btn.style.borderTop = 'none';
            });

            const targetSection = document.getElementById(viewId);
            if (targetSection) {
                targetSection.classList.add('active');
                targetSection.style.display = 'block';
            }

            if (btnElement) {
                btnElement.classList.add('active');
                btnElement.style.color = '#4da6ff';
                btnElement.style.borderTop = '3px solid #4da6ff';
            }

            closeAllInfoItemDetails();
            filterAllInfoItems();
        }

        function handleAllInfoTopAddButtonClick() {
            currentEditingAllInfoCard = null;
            allInfoUploadedImgUrl = '';

            const titleText = document.getElementById('all-info-modal-title-text');
            const submitBtn = document.getElementById('all-info-modal-submit-btn');
            const container = document.getElementById('all-info-dynamic-form-fields');

            submitBtn.innerText = 'Add Entry';

            if (currentAllInfoTab === 'info-view-all') {
                titleText.innerText = 'Add New Item';
                container.innerHTML = `
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Item Name / Title</label><input type="text" id="ai-field-1" placeholder="e.g. Water Pump 1HP" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Price / Subtitle</label><input type="text" id="ai-field-2" placeholder="e.g. Product • ₹4,500" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label><textarea id="ai-field-3" rows="3" placeholder="Enter item details..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label><input type="file" accept="image/*" onchange="handleAllInfoImageUpload(event)" style="width:100%; color:#fff;"></div>
        `;
            } else if (currentAllInfoTab === 'info-view-services') {
                titleText.innerText = 'Add New Service';
                container.innerHTML = `
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Service Name</label><input type="text" id="ai-field-1" placeholder="e.g. Electrical Fitting" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Service Type</label><input type="text" id="ai-field-2" placeholder="e.g. Electrical Maintenance" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description & Scope</label><textarea id="ai-field-3" rows="3" placeholder="Enter service details..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label><input type="file" accept="image/*" onchange="handleAllInfoImageUpload(event)" style="width:100%; color:#fff;"></div>
        `;
            } else {
                titleText.innerText = 'Add New Vacancy';
                container.innerHTML = `
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Job Title / Role</label><input type="text" id="ai-field-1" placeholder="e.g. Store Helper" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Salary</label><input type="text" id="ai-field-2" placeholder="e.g. Salary: ₹15,000 / month" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Eligibility & Responsibilities</label><textarea id="ai-field-3" rows="3" placeholder="e.g. 10th Pass required..." style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></textarea></div>
            <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Upload Image (Optional)</label><input type="file" accept="image/*" onchange="handleAllInfoImageUpload(event)" style="width:100%; color:#fff;"></div>
        `;
            }

            document.getElementById('all-info-add-modal').style.display = 'flex';
        }

        function handleAllInfoImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                allInfoUploadedImgUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function closeAllInfoAddModal() {
            document.getElementById('all-info-add-modal').style.display = 'none';
        }

        function submitNewAllInfoItem() {
            const val1 = document.getElementById('ai-field-1').value.trim();
            const val2 = document.getElementById('ai-field-2').value.trim();
            const val3 = document.getElementById('ai-field-3').value.trim();

            if (!val1) {
                alert('Please fill out the title/name.');
                return;
            }

            const title = val1;
            let sub = val2 || (currentAllInfoTab === 'info-view-services' ? 'Service' : 'No price specified');
            if (currentAllInfoTab === 'info-view-vacancies' && val2 && !/^salary\b/i.test(val2)) {
                const salary = val2.replace(/^₹\s*/, '').replace(/\s*\/\s*month$/i, '');
                sub = `Salary: ₹${salary} / month`;
            }
            const desc = val3 || 'No description added.';
            const defaultImg = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
            const img = allInfoUploadedImgUrl || defaultImg;

            if (currentEditingAllInfoCard) {
                currentEditingAllInfoCard.setAttribute('data-title', title.toLowerCase());
                currentEditingAllInfoCard.querySelector('.item-title').innerText = title;
                currentEditingAllInfoCard.querySelector('.item-sub').innerText = sub;
                const currentImg = allInfoUploadedImgUrl || currentEditingAllInfoCard.querySelector('.item-card-img').src;
                currentEditingAllInfoCard.querySelector('.item-card-img').src = currentImg;
                currentEditingAllInfoCard.dataset.description = desc;
                currentEditingAllInfoCard.onclick = () => openAllInfoItemDetails(title, sub, desc, currentImg);
                const type = currentAllInfoTab === 'info-view-services' ? 'service' :
                    currentAllInfoTab === 'info-view-vacancies' ? 'vacancy' : 'product';
                syncBusinessListingEdit(currentEditingAllInfoCard, type, title, sub, desc, currentImg);
            } else {
                const type = currentAllInfoTab === 'info-view-services' ? 'service' :
                    currentAllInfoTab === 'info-view-vacancies' ? 'vacancy' : 'product';
                addBusinessListing(type, title, sub, desc, img);
            }

            closeAllInfoAddModal();
            filterAllInfoItems();
        }

        function openAllInfoEditCardModal(e, btn) {
            e.stopPropagation();
            currentEditingAllInfoCard = btn.closest('.item-card');

            const titleText = document.getElementById('all-info-modal-title-text');
            const submitBtn = document.getElementById('all-info-modal-submit-btn');
            const container = document.getElementById('all-info-dynamic-form-fields');

            titleText.innerText = 'Edit Entry';
            submitBtn.innerText = 'Save Changes';

            const currentTitle = currentEditingAllInfoCard.querySelector('.item-title').innerText;
            const currentSub = currentEditingAllInfoCard.querySelector('.item-sub').innerText;
            const currentImg = currentEditingAllInfoCard.querySelector('.item-card-img').src;
            const currentDescription = currentEditingAllInfoCard.dataset.description || '';
            allInfoUploadedImgUrl = currentImg;

            container.innerHTML = `
        <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Title</label><input type="text" id="ai-field-1" value="${currentTitle}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
        <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Subtitle / Details</label><input type="text" id="ai-field-2" value="${currentSub}" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;"></div>
        <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Description</label><textarea id="ai-field-3" rows="3" style="width:100%; padding:10px; background:#24242c; border:1px solid #333340; color:#fff; border-radius:6px; outline:none;">${escapeHtml(currentDescription)}</textarea></div>
        <div class="form-group" style="margin-bottom:12px;"><label style="display:block; font-size:0.85rem; font-weight:600; color:#a0a0b0; margin-bottom:6px;">Replace Image (Optional)</label><input type="file" accept="image/*" onchange="handleAllInfoImageUpload(event)" style="width:100%; color:#fff;"></div>
    `;

            document.getElementById('all-info-add-modal').style.display = 'flex';
        }

        function openAllInfoItemDetails(title, sub, description, imgUrl = '') {
            document.getElementById('all-info-detail-item-title').innerText = title;
            document.getElementById('all-info-detail-item-sub').innerText = sub;
            document.getElementById('all-info-detail-item-desc').innerText = description;
            const imgContainer = document.getElementById('all-info-detail-img-container');
            const imgElement = document.getElementById('all-info-detail-item-img');

            if (imgUrl) {
                imgElement.src = imgUrl;
                imgContainer.style.display = 'block';
            } else {
                imgContainer.style.display = 'none';
            }

            document.getElementById('all-info-item-detail-page').style.display = 'block';
        }

        function closeAllInfoItemDetails() {
            document.getElementById('all-info-item-detail-page').style.display = 'none';
        }

        function filterAllInfoItems() {
            const query = document.getElementById('all-info-search-input').value.toLowerCase().trim();
            const activeSection = document.querySelector('#allInfoHubOverlay .view-section.active');
            if (!activeSection) return;
            activeSection.querySelectorAll('.item-card').forEach(card => {
                const title = card.getAttribute('data-title');
                card.style.display = (!query || (title && title.includes(query))) ? 'flex' : 'none';
            });
        }

        function switchInfoHubMainTab(tabName, element) {
            // 1. Update the active styling on the top INFO / FEED buttons
            document.querySelectorAll('#allInfoHubOverlay .company-cat-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.background = 'rgba(0, 240, 255, 0.05)';
                btn.style.borderColor = 'rgba(0, 240, 255, 0.3)';
                btn.style.color = 'rgba(255, 255, 255, 0.7)';
            });

            if (element) {
                element.classList.add('active');
                element.style.background = 'rgba(0, 240, 255, 0.2)';
                element.style.borderColor = '#00f0ff';
                element.style.color = '#fff';
            }

            const mainContainer = document.querySelector('#allInfoHubOverlay .main-container');
            const footerTabs = document.querySelector('#allInfoHubOverlay .app-footer');

            // Create or select the rich Feed container inside the Info Hub overlay
            let feedContainer = document.getElementById('infoHubFeedSection');
            if (!feedContainer) {
                feedContainer = document.createElement('div');
                feedContainer.id = 'infoHubFeedSection';
                feedContainer.style.display = 'none';
                feedContainer.innerHTML = `
            <!-- USER ACTIVITY SECTION -->
            <div class="profile-info-section" style="padding: 16px 0 0 0;">
                <h2 class="profile-name-title" style="font-family: 'Times New Roman', sans-serif; font-size: 1.1rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px;">
                    NAME <i class="fa-solid fa-circle-check" style="color: #00f0ff; font-size: 0.85rem;"></i>
                </h2>
                <div class="profile-handle" style="font-size: 1rem; color: rgba(255, 255, 255, 0.6); margin-top: 2px;">@username</div>
                <div class="profile-about-tag" style="font-size: 1rem; color: #00f0ff; font-weight: 700; margin-top: 6px; text-transform: uppercase;">ABOUT:</div>

                
                <div class="profile-stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.1); text-align: center;">
                    <div class="stat-item" style="display: flex; flex-direction: column;"><span class="stat-value" style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 800; color: #00f0ff;">0</span><span class="stat-label" style="font-size: 0.72rem; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; margin-top: 2px;">Likes</span></div>
                    <div class="stat-item" style="display: flex; flex-direction: column;"><span class="stat-value" style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 800; color: #00f0ff;">0</span><span class="stat-label" style="font-size: 0.72rem; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; margin-top: 2px;">Reposts</span></div>
                    <div class="stat-item" style="display: flex; flex-direction: column;"><span class="stat-value" style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 800; color: #00f0ff;">0</span><span class="stat-label" style="font-size: 0.72rem; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; margin-top: 2px;">Comments</span></div>
                    <div class="stat-item" style="display: flex; flex-direction: column;"><span class="stat-value" style="font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 800; color: #00f0ff;">0</span><span class="stat-label" style="font-size: 0.72rem; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; margin-top: 2px;">Shares</span></div>
                </div>
            </div>

            <!-- TABS HEADER -->
            <div class="profile-tabs-header" style="display: flex; align-items: center; justify-content: space-around; margin-top: 18px; padding: 0 4px;">
                <button class="profile-tab-btn active" style="background: transparent; border: 2px solid #ffffff; color: #fff; font-size: 1.25rem; padding: 8px 12px; cursor: pointer; flex: 1; display: flex; justify-content: center;"><i class="fa-solid fa-border-all"></i></button>
                <button class="profile-tab-btn" style="background: transparent; border: 2px solid transparent; border-bottom: 2px solid #fff; color: rgba(255,255,255,0.7); font-size: 1.25rem; padding: 8px 12px; cursor: pointer; flex: 1; display: flex; justify-content: center;"><i class="fa-solid fa-images"></i></button>
                <button class="profile-tab-btn" style="background: transparent; border: 2px solid transparent; border-bottom: 2px solid #fff; color: rgba(255,255,255,0.7); font-size: 1.25rem; padding: 8px 12px; cursor: pointer; flex: 1; display: flex; justify-content: center;"><i class="fa-solid fa-video"></i></button>
            </div>

            <!-- POST CARDS FEED STREAM -->
            <div class="social-feed" style="width: 100%; display: flex; flex-direction: column; gap: 20px; margin-top: 20px;">
                <div class="social-post-card" style="border-bottom: 1px solid rgba(255,255,255,0.15); padding: 16px 0; display: flex; flex-direction: column; gap: 12px;">
                    <div class="post-header" style="display: flex; align-items: center; gap: 10px;">
                        <div class="post-avatar" style="width: 40px; height: 40px; background: linear-gradient(135deg, #00f0ff, #ff007f); display: flex; align-items: center; justify-content: center; font-weight: bold; color: #fff;">USER</div>
                        <div class="post-author-info">
                            <h4 style="font-size: 1rem; color: #fff;">USER <i class="fa-solid fa-circle-check" style="color:#00f0ff;"></i></h4>
                            <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">1 OCT 2026 • 10:00 AM</span>
                        </div>
                    </div>
                    <p class="post-text" style="font-size: 1rem; color: rgba(255,255,255,0.9); line-height: 1.4;">🚀 Welcome to my official personal profile feed! Here are all my custom updates and ecosystem launches.</p>
                </div>
            </div>
        `;
                mainContainer.appendChild(feedContainer);
            }

            if (tabName === 'feed') {
                document.querySelectorAll('#allInfoHubOverlay .view-section').forEach(sec => sec.style.display = 'none');
                if (footerTabs) footerTabs.style.display = 'none';
                feedContainer.style.display = 'block';
            } else {
                if (footerTabs) footerTabs.style.display = 'flex';
                feedContainer.style.display = 'none';
                const activeSubSection = document.getElementById(currentAllInfoTab);
                if (activeSubSection) {
                    activeSubSection.style.display = 'block';
                }
            }
        }

        function initFeedMediaUploaders(feedSelector) {
            const mediaTypes = {
                image: {
                    accept: 'image/*',
                    prompt: 'Add an image to this post'
                },
                video: {
                    accept: 'video/*',
                    prompt: 'Add a video to this post'
                },
                audio: {
                    accept: 'audio/*',
                    prompt: 'Add an audio clip to this post'
                },
                file: {
                    accept: '',
                    prompt: 'Add a file to this post'
                }
            };

            const feed = document.querySelector(feedSelector);
            if (!feed) return;

            feed.querySelectorAll('.social-post-card').forEach(card => {
                const type = card.getAttribute('data-type');
                const config = mediaTypes[type];
                const container = card.querySelector('.post-media-container');

                if (!config || !container) return;

                // Clear any existing media and build the uploader UI
                container.innerHTML = `
            <div class="profile-feed-media-editor">
                <span>${config.prompt}</span>
                <label class="profile-feed-upload">
                    <span>Choose ${type}</span>
                    <input type="file" ${config.accept ? `accept="${config.accept}"` : ''}>
                </label>
                <div class="profile-feed-media-preview"></div>
            </div>
        `;

                const input = container.querySelector('input[type="file"]');
                const preview = container.querySelector('.profile-feed-media-preview');

                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const fileUrl = URL.createObjectURL(file);

                    if (type === 'image') {
                        preview.innerHTML = `<img src="${fileUrl}" alt="${file.name}">`;
                    } else if (type === 'video') {
                        preview.innerHTML = `<video controls playsinline src="${fileUrl}"></video>`;
                    } else if (type === 'audio') {
                        preview.innerHTML = `<audio controls src="${fileUrl}"></audio>`;
                    } else {
                        preview.innerHTML = `
                    <div style="padding: 10px; background: rgba(0,240,255,0.1); border-radius: 6px; color: #fff;">
                        <i class="fa-solid fa-file-lines" style="color: #00f0ff; margin-right: 6px;"></i>
                        ${file.name} (${(file.size / 1024).toFixed(1)} KB)
                    </div>
                `;
                    }
                });
            });
        }

        // Initialize after the legacy markup has been mounted. In Next.js this
        // script is injected after hydration, so DOMContentLoaded may have fired.
        function initializeInfinityFeedMediaUploaders() {
            initFeedMediaUploaders('#userFeed');
            initFeedMediaUploaders('#socialFeed');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeInfinityFeedMediaUploaders, { once: true });
        } else {
            initializeInfinityFeedMediaUploaders();
        }

        function handleCompanyMediaUpload(input, type) {
            const card = input.closest('.social-post-card');
            const previewContainer = card.querySelector('.profile-feed-media-preview');
            const editorBox = card.querySelector('.profile-feed-media-editor');

            if (!input.files || !input.files[0]) return;
            const file = input.files[0];
            const fileUrl = URL.createObjectURL(file);

            editorBox.style.display = 'none';
            previewContainer.innerHTML = '';

            if (type === 'image') {
                previewContainer.innerHTML = `<img src="${fileUrl}" alt="${file.name}" style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">`;
            } else if (type === 'video') {
                previewContainer.innerHTML = `<video src="${fileUrl}" controls playsinline style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);"></video>`;
            } else if (type === 'audio') {
                previewContainer.innerHTML = `<audio src="${fileUrl}" controls style="width: 100%; margin-top: 5px;"></audio>`;
            } else if (type === 'file') {
                const sizeKB = (file.size / 1024).toFixed(1);
                previewContainer.innerHTML = `
            <div style="background: rgba(0, 240, 255, 0.05); border: 1px solid rgba(0, 240, 255, 0.2); border-radius: 8px; padding: 14px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <i class="fa-solid fa-file-lines" style="font-size: 2.2rem; color: #ff007f;"></i>
                    <div>
                        <div style="font-weight: 700; font-size: 0.95rem; color: #fff;">${file.name}</div>
                        <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.6);">${sizeKB} KB</div>
                    </div>
                </div>
                <a href="${fileUrl}" download="${file.name}" style="background: rgba(0, 240, 255, 0.1); padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(0, 240, 255, 0.3); color: #00f0ff; text-decoration: none; font-size: 1rem;">
                    <i class="fa-solid fa-download"></i>
                </a>
            </div>`;
            }
        }
