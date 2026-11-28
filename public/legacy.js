/* Inline application script extracted from the supplied infinity.html. */
// ── SOCIAL INTERACTIONS (PERSISTENT + API SYNCED) ──
        let activeCommentPost = null;
        let activeCommentButton = null;
        let activeShareButton = null;
        let postCommentSort = 'recent';
        const postCommentsByKey = new Map();
        const SOCIAL_STORAGE_KEY = 'infinity_social_state_v1';
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        function getCurrentAuthorInfo() {
            try {
                const raw = localStorage.getItem('userData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const profile = parsed?.profile;
                    if (profile) {
                        const name = profile.display_name || profile.username || 'User';
                        const initial = String(name).replace(/^(?:♾️|♾|∞|@)+/u, '').trim().charAt(0).toUpperCase() || 'U';
                        return { name, initial };
                    }
                }
            } catch {}
            return { name: 'Visitor', initial: 'V' };
        }

        function loadSocialStore() {
            try {
                const raw = localStorage.getItem(SOCIAL_STORAGE_KEY);
                return raw ? JSON.parse(raw) : { posts: {}, follows: {} };
            } catch {
                return { posts: {}, follows: {} };
            }
        }

        function saveSocialStore(store) {
            try {
                localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(store));
            } catch (err) {
                console.warn('Could not save social state:', err);
            }
        }

        function getPostKey(post) {
            if (!post) return null;
            if (post.dataset.postId) return post.dataset.postId;
            if (post.dataset.postKey) return post.dataset.postKey;
            const allCards = Array.from(document.querySelectorAll('.social-post-card'));
            const index = allCards.indexOf(post);
            const author = (post.querySelector('.post-author-info h4')?.textContent || '').trim().slice(0, 24);
            const snippet = (post.querySelector('.post-text')?.textContent || '').trim().slice(0, 32);
            const key = `card_${index >= 0 ? index : 0}_${author}_${snippet}`.replace(/\s+/g, '_');
            post.dataset.postKey = key;
            return key;
        }

        function parseActionCount(text) {
            const raw = String(text || '0').trim();
            const match = raw.match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
            if (!match) return parseInt(raw, 10) || 0;
            const num = parseFloat(match[1]);
            const suffix = (match[2] || '').toUpperCase();
            if (suffix === 'K') return Math.round(num * 1000);
            if (suffix === 'M') return Math.round(num * 1000000);
            if (suffix === 'B') return Math.round(num * 1000000000);
            return Math.round(num);
        }

        function formatCommentCount(value) {
            const safe = Math.max(0, Number(value) || 0);
            if (safe >= 1000000) return `${(safe / 1000000).toFixed(safe % 1000000 ? 1 : 0).replace(/\.0$/, '')}M`;
            if (safe >= 1000) return `${(safe / 1000).toFixed(safe % 1000 ? 1 : 0).replace(/\.0$/, '')}K`;
            return String(safe);
        }

        function getPostComments(post) {
            const key = getPostKey(post);
            if (!key) return [];
            if (!postCommentsByKey.has(key)) {
                const store = loadSocialStore();
                const saved = store.posts?.[key]?.comments;
                postCommentsByKey.set(key, Array.isArray(saved) ? saved : []);
            }
            return postCommentsByKey.get(key);
        }

        function persistPostComments(post) {
            const key = getPostKey(post);
            if (!key) return;
            const store = loadSocialStore();
            store.posts[key] = store.posts[key] || {};
            store.posts[key].comments = getPostComments(post);
            const commentBtn = getPostCommentButton(post);
            const countEl = commentBtn?.querySelector('.action-count');
            if (countEl) {
                store.posts[key].commentCount = countEl.textContent.trim();
            }
            saveSocialStore(store);
        }

        function getPostCommentButton(post) {
            return Array.from(post.querySelectorAll('.action-group-left .action-btn'))
                .find(button => button.querySelector('i.fa-comment')) || null;
        }

        function requireRegistrationForPostAction() {
            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            if (identity && identity.id) return true;
            window.location.href = '/login?type=personal&register=true';
            return false;
        }

        async function openPostComments(post, commentButton = null) {
            if (!requireRegistrationForPostAction()) return;
            if (!post || !post.classList.contains('social-post-card')) return;

            activeCommentPost = post;
            activeCommentButton = commentButton || getPostCommentButton(post);

            const preview = document.getElementById('postCommentsPreview');
            preview.replaceChildren();
            const postCopy = post.cloneNode(true);
            postCopy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
            postCopy.querySelectorAll('.post-actions button').forEach((button, idx) => { button.addEventListener('click', (ev) => { ev.stopPropagation(); const origBtns = post.querySelectorAll('.post-actions button'); if (origBtns[idx]) origBtns[idx].click(); }); });
            preview.appendChild(postCopy);

            const count = activeCommentButton?.querySelector('.action-count')?.textContent.trim() || '0';
            document.getElementById('postCommentsCount').textContent = `${count} Comments`;
            document.getElementById('postCommentsSortLabel').textContent = 'Sort by';
            postCommentSort = 'recent';

            const postId = post.dataset.postId;
            if (postId && UUID_REGEX.test(postId)) {
                try {
                    const res = await fetch(`/api/posts/${postId}/comments`, { credentials: 'include' });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && Array.isArray(json.data)) {
                            const mapped = [];
                            const byId = new Map();
                            json.data.forEach(row => {
                                const authorName = row.author?.display_name || row.author?.username || 'User';
                                const item = {
                                    id: row.id,
                                    author: authorName,
                                    initial: String(authorName).replace(/^(?:♾️|♾|∞|@)+/u, '').trim().charAt(0).toUpperCase() || 'U',
                                    text: row.content,
                                    time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                    likes: row.like_count || 0,
                                    liked: false,
                                    replies: [],
                                    shares: 0,
                                    reposts: 0,
                                    reposted: false,
                                    bookmarked: false
                                };
                                byId.set(row.id, item);
                                if (!row.parent_comment_id) mapped.push(item);
                            });
                            json.data.forEach(row => {
                                if (row.parent_comment_id && byId.has(row.parent_comment_id) && byId.has(row.id)) {
                                    byId.get(row.parent_comment_id).replies.push(byId.get(row.id));
                                }
                            });
                            postCommentsByKey.set(getPostKey(post), mapped);
                        }
                    }
                } catch {}
            }

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

        function buildCommentElement(comment, depth = 0) {
            const row = document.createElement('article');
            row.className = 'post-comment';
            row.dataset.commentId = String(comment.id);
            if (depth > 0) {
                row.style.marginLeft = Math.min(depth, 4) * 18 + 'px';
                row.style.borderLeft = '2px solid rgba(57, 232, 244, 0.25)';
                row.style.paddingLeft = '10px';
            }

            const avatar = document.createElement('div');
            avatar.className = 'post-comments-avatar';
            avatar.textContent = comment.initial || String(comment.author || 'V').replace(/^(?:♾️|♾|∞|@)+/u, '').trim().charAt(0).toUpperCase() || 'V';

            const body = document.createElement('div');
            body.className = 'post-comment-body';
            const meta = document.createElement('div');
            meta.className = 'post-comment-meta';
            meta.textContent = `${comment.author} · ${comment.time || ''}`;
            const text = document.createElement('div');
            text.textContent = comment.text;

            const actions = document.createElement('div');
            actions.className = 'post-comment-actions';
            const likeButton = createCommentAction(comment.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart', comment.likes || 0, 'Like comment');
            likeButton.classList.toggle('liked', Boolean(comment.liked));
            likeButton.addEventListener('click', () => toggleCommentLike(comment.id));

            const repliesArr = Array.isArray(comment.replies) ? comment.replies : [];
            const replyButton = createCommentAction('fa-regular fa-comment', repliesArr.length, 'Reply to comment');
            replyButton.addEventListener('click', () => showCommentReplyForm(comment.id));

            const shareButton = createCommentAction('fa-regular fa-paper-plane', comment.shares || 0, 'Share comment');
            shareButton.addEventListener('click', () => shareComment(comment.id));

            const repostButton = createCommentAction('fa-solid fa-retweet', comment.reposts || 0, 'Repost comment');
            repostButton.classList.toggle('reposted', Boolean(comment.reposted));
            repostButton.addEventListener('click', () => toggleCommentRepost(comment.id));

            const downloadButton = createCommentAction('fa-solid fa-download', null, 'Download comment');
            downloadButton.addEventListener('click', () => {
                const blob = new Blob([`${comment.author}: ${comment.text}`], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'comment.txt';
                a.click();
                URL.revokeObjectURL(a.href);
            });
            actions.append(likeButton, replyButton, shareButton, repostButton, downloadButton);

            body.append(meta, text, actions);

            if (repliesArr.length > 0) {
                const repliesWrap = document.createElement('div');
                repliesWrap.className = 'post-comment-replies';
                repliesWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-top:8px;';
                repliesArr.forEach(reply => {
                    const normalizedReply = reply.id ? reply : {
                        id: 'reply_' + Math.random().toString(36).slice(2, 9),
                        author: reply.author || 'User',
                        initial: String(reply.author || 'U').charAt(0).toUpperCase(),
                        text: reply.text || '',
                        time: reply.time || '',
                        likes: 0,
                        liked: false,
                        replies: Array.isArray(reply.replies) ? reply.replies : [],
                        shares: 0,
                        reposts: 0,
                        reposted: false
                    };
                    repliesWrap.appendChild(buildCommentElement(normalizedReply, depth + 1));
                });
                body.appendChild(repliesWrap);
            }

            row.append(avatar, body);
            return row;
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
                list.appendChild(buildCommentElement(comment, 0));
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

        function findCommentRecursive(list, commentId) {
            for (const c of list) {
                if (String(c.id) === String(commentId)) return c;
                if (Array.isArray(c.replies) && c.replies.length > 0) {
                    const found = findCommentRecursive(c.replies, commentId);
                    if (found) return found;
                }
            }
            return null;
        }

        function findPostComment(commentId) {
            return findCommentRecursive(getPostComments(activeCommentPost), commentId);
        }

        function toggleCommentLike(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.liked = !comment.liked;
            comment.likes = Math.max(0, (comment.likes || 0) + (comment.liked ? 1 : -1));
            persistPostComments(activeCommentPost);
            renderPostComments();
        }

        function toggleCommentRepost(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.reposted = !comment.reposted;
            comment.reposts = Math.max(0, (comment.reposts || 0) + (comment.reposted ? 1 : -1));
            persistPostComments(activeCommentPost);
            renderPostComments();
        }

        function toggleCommentBookmark(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.bookmarked = !comment.bookmarked;
            persistPostComments(activeCommentPost);
            renderPostComments();
        }

        function shareComment(commentId) {
            const comment = findPostComment(commentId);
            if (!comment) return;

            comment.shares = (comment.shares || 0) + 1;
            persistPostComments(activeCommentPost);
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

            form.addEventListener('submit', async event => {
                event.preventDefault();
                const text = input.value.trim();
                const comment = findPostComment(commentId);
                if (!text || !comment) return;
                const { name } = getCurrentAuthorInfo();
                comment.replies.push({ author: name, text });
                persistPostComments(activeCommentPost);
                renderPostComments();

                const postId = activeCommentPost?.dataset?.postId;
                if (postId && UUID_REGEX.test(postId) && UUID_REGEX.test(String(commentId))) {
                    fetch(`/api/posts/${postId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ content: text, parent_comment_id: commentId })
                    }).catch(() => {});
                }
            });

            form.append(input, submit);
            row.querySelector('.post-comment-body').appendChild(form);
            input.focus();
        }

        async function submitPostComment(event) {
            event.preventDefault();
            const input = document.getElementById('postCommentsInput');
            const text = input.value.trim();
            if (!text || !activeCommentPost) return;

            const { name, initial } = getCurrentAuthorInfo();
            const comments = getPostComments(activeCommentPost);
            const newComment = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                author: name,
                initial,
                text,
                time: 'now',
                likes: 0,
                liked: false,
                replies: [],
                shares: 0,
                reposts: 0,
                reposted: false,
                bookmarked: false
            };
            comments.push(newComment);

            const countElement = activeCommentButton?.querySelector('.action-count');
            if (countElement) {
                const currentCount = parseActionCount(countElement.textContent);
                const formatted = formatCommentCount(currentCount + 1);
                countElement.textContent = formatted;
                document.getElementById('postCommentsCount').textContent = `${formatted} Comments`;
            } else {
                document.getElementById('postCommentsCount').textContent = `${comments.length} Comments`;
            }

            persistPostComments(activeCommentPost);
            input.value = '';
            renderPostComments();

            const postId = activeCommentPost.dataset.postId;
            if (postId && UUID_REGEX.test(postId)) {
                try {
                    const res = await fetch(`/api/posts/${postId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ content: text })
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.data?.id) {
                            newComment.id = json.data.id;
                            persistPostComments(activeCommentPost);
                        }
                    }
                } catch {}
            }
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
            if (!requireRegistrationForPostAction()) return;
            const icon = btn.querySelector('i');
            const count = btn.querySelector('.action-count');
            if (!count) return;
            const post = btn.closest('.social-post-card');
            const nextLiked = !btn.classList.contains('liked');
            btn.classList.toggle('liked', nextLiked);
            if (icon) icon.className = nextLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            const current = parseActionCount(count.textContent);
            const nextCount = Math.max(0, current + (nextLiked ? 1 : -1));
            count.textContent = formatCommentCount(nextCount);

            if (post) {
                const key = getPostKey(post);
                const store = loadSocialStore();
                store.posts[key] = store.posts[key] || {};
                store.posts[key].liked = nextLiked;
                store.posts[key].likeCount = count.textContent;
                saveSocialStore(store);

                const postId = post.dataset.postId;
                if (postId && UUID_REGEX.test(postId)) {
                    fetch(`/api/posts/${postId}/like`, {
                        method: nextLiked ? 'POST' : 'DELETE',
                        credentials: 'include'
                    }).catch(() => {});
                }
            }
        }


        window.downloadPostMedia = function (btn) {
            const post = btn?.closest('.social-post-card');
            if (!post) return;
            const img = post.querySelector('.post-media-container img');
            const vid = post.querySelector('.post-media-container video');
            const aud = post.querySelector('.post-media-container audio');
            const fileLink = post.querySelector('.post-media-container a[href]');
            const mediaSrc = img?.src || vid?.src || aud?.src || fileLink?.href || '';

            if (mediaSrc) {
                const a = document.createElement('a');
                a.href = mediaSrc;
                a.download = fileLink?.getAttribute('download') || 'infinity-media';
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                document.body.appendChild(a);
                a.click();
                a.remove();
                return;
            }

            const text = (post.querySelector('.post-text')?.textContent || '').trim();
            const author = (post.querySelector('.post-author-info h4')?.textContent || 'post').trim();
            const blob = new Blob([author + '\n\n' + text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'infinity-post.txt';
            a.click();
            URL.revokeObjectURL(a.href);
        };

        function toggleBookmark(btn) {
            if (!requireRegistrationForPostAction()) return;
            const post = btn.closest('.social-post-card');
            const nextBookmarked = !btn.classList.contains('bookmarked');
            btn.classList.toggle('bookmarked', nextBookmarked);
            const icon = btn.querySelector('i');
            if (icon) icon.className = nextBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';

            if (post) {
                const key = getPostKey(post);
                const store = loadSocialStore();
                store.posts[key] = store.posts[key] || {};
                store.posts[key].bookmarked = nextBookmarked;
                saveSocialStore(store);

                const postId = post.dataset.postId;
                if (postId && UUID_REGEX.test(postId)) {
                    fetch(`/api/posts/${postId}/bookmark`, {
                        method: nextBookmarked ? 'POST' : 'DELETE',
                        credentials: 'include'
                    }).catch(() => {});
                }
            }
        }

        function toggleRepost(btn) {
            if (!requireRegistrationForPostAction()) return;
            const count = btn.querySelector('.action-count');
            if (!count) return;
            const post = btn.closest('.social-post-card');
            const nextReposted = !btn.classList.contains('reposted');
            btn.classList.toggle('reposted', nextReposted);
            const current = parseActionCount(count.textContent);
            const nextCount = Math.max(0, current + (nextReposted ? 1 : -1));
            count.textContent = formatCommentCount(nextCount);

            if (post) {
                const key = getPostKey(post);
                const store = loadSocialStore();
                store.posts[key] = store.posts[key] || {};
                store.posts[key].reposted = nextReposted;
                store.posts[key].repostCount = count.textContent;
                saveSocialStore(store);

                const postId = post.dataset.postId;
                if (nextReposted && postId && UUID_REGEX.test(postId)) {
                    fetch(`/api/posts/${postId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ share_type: 'repost' })
                    }).catch(() => {});
                }
            }
        }

        function getFollowButtonTargetKey(btn) {
            const post = btn?.closest('.social-post-card');
            const author = (post?.querySelector('.post-author-info h4')?.textContent || btn?.dataset?.author || '').trim();
            return author.toLowerCase();
        }

        function applySupportStateToAllButtons(targetKey, isSupported) {
            if (!targetKey) return;
            document.querySelectorAll('.follow-btn').forEach(b => {
                if (getFollowButtonTargetKey(b) === targetKey) {
                    b.classList.toggle('following', isSupported);
                    b.textContent = isSupported ? 'Supporting...' : '+ SUPPORT';
                }
            });
        }

        async function syncTargetSupportsFromDatabase() {
            try {
                const activeUid = (typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity()?.id : null) || (typeof getCurrentViewerUserId === 'function' ? getCurrentViewerUserId() : null);
                const url = '/api/support' + (activeUid ? ('?viewer_id=' + encodeURIComponent(activeUid)) : '');
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                if (!res.ok) return;
                const json = await res.json();
                if (!json || !json.success || !json.data || !Array.isArray(json.data.supported_targets)) return;
                const supportedSet = new Set(json.data.supported_targets.map(t => String(t).toLowerCase()));
                const store = loadSocialStore();
                store.followsByAccount = store.followsByAccount || {};
                const acctKey = activeUid || 'anon';
                store.followsByAccount[acctKey] = {};
                document.querySelectorAll('.follow-btn').forEach(b => {
                    const key = getFollowButtonTargetKey(b);
                    if (!key) return;
                    const isSupported = supportedSet.has(key);
                    store.followsByAccount[acctKey][key] = isSupported;
                    b.classList.toggle('following', isSupported);
                    b.textContent = isSupported ? 'Supporting...' : '+ SUPPORT';
                });
                saveSocialStore(store);
            } catch {}
        }

        window.syncTargetSupportsFromDatabase = syncTargetSupportsFromDatabase;
        window.toggleFollow = toggleFollow;
        window.syncSupportButtonElement = function (btn) {
            if (!btn) return;
            const key = getFollowButtonTargetKey(btn);
            if (!key) return;
            try {
                const activeUid = (typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity()?.id : null) || (typeof getCurrentViewerUserId === 'function' ? getCurrentViewerUserId() : null);
                const acctKey = activeUid || 'anon';
                const store = loadSocialStore();
                const isSupported = Boolean(store?.followsByAccount?.[acctKey]?.[key]);
                btn.classList.toggle('following', isSupported);
                btn.textContent = isSupported ? 'Supporting...' : '+ SUPPORT';
            } catch {}
        };

        async function toggleFollow(btn) {
            const targetKey = getFollowButtonTargetKey(btn);
            const nextSupported = !btn.classList.contains('following');
            applySupportStateToAllButtons(targetKey, nextSupported);

            if (targetKey) {
                const activeUid = (typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity()?.id : null) || (typeof getCurrentViewerUserId === 'function' ? getCurrentViewerUserId() : null);
                const acctKey = activeUid || 'anon';
                const store = loadSocialStore();
                store.followsByAccount = store.followsByAccount || {};
                store.followsByAccount[acctKey] = store.followsByAccount[acctKey] || {};
                store.followsByAccount[acctKey][targetKey] = nextSupported;
                saveSocialStore(store);

                try {
                    const res = await fetch('/api/support', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_key: targetKey, user_id: activeUid || undefined })
                    });
                    if (res.status === 401) {
                        applySupportStateToAllButtons(targetKey, !nextSupported);
                        window.location.href = '/login?type=personal&register=true';
                        return;
                    }
                    const json = await res.json().catch(() => ({}));
                    if (res.ok && json?.success && json?.data) {
                        const confirmed = Boolean(json.data.supported);
                        applySupportStateToAllButtons(targetKey, confirmed);
                        const updatedStore = loadSocialStore();
                        updatedStore.followsByAccount = updatedStore.followsByAccount || {};
                        updatedStore.followsByAccount[acctKey] = updatedStore.followsByAccount[acctKey] || {};
                        updatedStore.followsByAccount[acctKey][targetKey] = confirmed;
                        saveSocialStore(updatedStore);
                    }
                } catch {}
            }
        }

        // ── SHARE MODAL LOGIC ──
        function recordShareInteraction(btn) {
            if (!btn) return;
            const count = btn.querySelector('.action-count');
            const post = btn.closest('.social-post-card');
            if (count) {
                const current = parseActionCount(count.textContent);
                count.textContent = formatCommentCount(current + 1);
            }
            if (post) {
                const key = getPostKey(post);
                const store = loadSocialStore();
                store.posts[key] = store.posts[key] || {};
                if (count) store.posts[key].shareCount = count.textContent;
                saveSocialStore(store);

                const postId = post.dataset.postId;
                if (postId && UUID_REGEX.test(postId)) {
                    fetch(`/api/posts/${postId}/share`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ share_type: 'external' })
                    }).catch(() => {});
                }
            }
        }

        function openShareModal(triggerBtn = null) {
            if (!requireRegistrationForPostAction()) return;
            activeShareButton = triggerBtn || (window.event?.currentTarget instanceof Element ? window.event.currentTarget : null);
            if (activeShareButton) {
                recordShareInteraction(activeShareButton);
            }
            document.getElementById('shareModalOverlay').classList.add('active');
        }

        function closeShareModal(event) {
            document.getElementById('shareModalOverlay').classList.remove('active');
        }

        function restoreAllSocialInteractions() {
            const store = loadSocialStore();
            document.querySelectorAll('.social-post-card').forEach(post => {
                const key = getPostKey(post);
                const saved = store.posts?.[key];
                if (saved) {
                    const likeBtn = Array.from(post.querySelectorAll('.action-btn')).find(b => b.querySelector('i.fa-heart'));
                    if (likeBtn && typeof saved.liked === 'boolean') {
                        likeBtn.classList.toggle('liked', saved.liked);
                        const icon = likeBtn.querySelector('i');
                        if (icon) icon.className = saved.liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
                        const count = likeBtn.querySelector('.action-count');
                        if (count && saved.likeCount !== undefined) count.textContent = saved.likeCount;
                    }
                    const commentBtn = getPostCommentButton(post);
                    if (commentBtn && saved.commentCount !== undefined) {
                        const count = commentBtn.querySelector('.action-count');
                        if (count) count.textContent = saved.commentCount;
                    }
                    const shareBtn = Array.from(post.querySelectorAll('.action-btn')).find(b => b.querySelector('i.fa-paper-plane'));
                    if (shareBtn && saved.shareCount !== undefined) {
                        const count = shareBtn.querySelector('.action-count');
                        if (count) count.textContent = saved.shareCount;
                    }
                    const repostBtn = Array.from(post.querySelectorAll('.action-btn')).find(b => b.querySelector('i.fa-retweet'));
                    if (repostBtn && typeof saved.reposted === 'boolean') {
                        repostBtn.classList.toggle('reposted', saved.reposted);
                        const count = repostBtn.querySelector('.action-count');
                        if (count && saved.repostCount !== undefined) count.textContent = saved.repostCount;
                    }
                    const bookmarkBtn = Array.from(post.querySelectorAll('.action-btn')).find(b => b.querySelector('i.fa-bookmark'));
                    if (bookmarkBtn && typeof saved.bookmarked === 'boolean') {
                        bookmarkBtn.classList.toggle('bookmarked', saved.bookmarked);
                        const icon = bookmarkBtn.querySelector('i');
                        if (icon) icon.className = saved.bookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
                    }
                }

                const followBtn = post.querySelector('.follow-btn');
                const author = (post.querySelector('.post-author-info h4')?.textContent || '').trim();
                const authorKey = author.toLowerCase();
                const acctUidForApply = (typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity()?.id : null) || (typeof getCurrentViewerUserId === 'function' ? getCurrentViewerUserId() : null) || 'anon';
                const acctFollows = store.followsByAccount && store.followsByAccount[acctUidForApply];
                if (followBtn && authorKey && acctFollows) {
                    const savedVal = typeof acctFollows[authorKey] === 'boolean'
                        ? acctFollows[authorKey]
                        : (typeof acctFollows[author] === 'boolean' ? acctFollows[author] : null);
                    if (typeof savedVal === 'boolean') {
                        followBtn.classList.toggle('following', savedVal);
                        followBtn.textContent = savedVal ? 'Supporting...' : '+ SUPPORT';
                    }
                }
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                restoreAllSocialInteractions();
                syncTargetSupportsFromDatabase();
            });
        } else {
            restoreAllSocialInteractions();
            syncTargetSupportsFromDatabase();
        }

        function setHomeFeedFloatingActionsVisible(visible) {
            document.querySelectorAll('.home-feed-floating-action').forEach(button => {
                button.style.display = visible ? 'flex' : 'none';
            });
        }

        setHomeFeedFloatingActionsVisible(true);

        function openMessageFloaterPage() {
            setHomeFeedFloatingActionsVisible(false);
            const feed = document.getElementById('messageFloaterFeed');
            if (feed && !feed.dataset.uploadersInitialized && typeof initFeedMediaUploaders === 'function') {
                initFeedMediaUploaders('#messageFloaterFeed');
                feed.dataset.uploadersInitialized = 'true';
            }
            const page = document.getElementById('messageFloaterPage');
            if (page) {
                page.style.display = 'block';
                page.scrollTop = 0;
            }
        }

        function closeMessageFloaterPage() {
            const page = document.getElementById('messageFloaterPage');
            if (page) {
                page.style.display = 'none';
            }
            const socialPage = document.getElementById('socialMediaPage');
            const socialFeed = document.getElementById('socialFeed');
            if (socialPage && socialPage.style.display !== 'none' && socialFeed && socialFeed.style.display !== 'none') {
                setHomeFeedFloatingActionsVisible(true);
            }
        }

        // ── PROFILE / FEED TOGGLE LOGIC ──
        let activeView = 'home'; // 'home', 'user', or 'company'

        function toggleUserPage() {
            if (typeof window.renderDbFeedInto === 'function') { void window.renderDbFeedInto('userFeed', 'mine'); }
            setHomeFeedFloatingActionsVisible(false);
            const userPage = document.getElementById('userProfilePage');
            const companyPage = document.getElementById('personalProfilePage');
            const homeFeed = document.getElementById('socialFeed');
            const header = document.getElementById('mainHeader');
            const footer = document.querySelector('.fixed-footer');

            if (activeView === 'user') {
                activeView = 'home';
                try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
                userPage.style.display = 'none';
                if (companyPage) companyPage.style.display = 'none';
                homeFeed.style.display = 'flex';
                footer.style.display = 'flex';
                header.classList.remove('hidden');
            } else {
                activeView = 'user';
                try { localStorage.setItem('infinityActivePageView', 'business'); } catch {}
                userPage.style.display = 'block';
                if (companyPage) companyPage.style.display = 'none';
                homeFeed.style.display = 'none';
                footer.style.display = 'none';
                header.classList.add('hidden'); // Completely removes header from layout flow
                window.scrollTo(0, 0);
            }
        }

        function toggleCompanyPage() {
            return;
        }

        function switchCompanyCategory() {
            return;
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
                if (typeof window.syncBusinessFeedHeader === 'function') {
                    window.syncBusinessFeedHeader();
                }
            } else if (category === 'activity') {
                window.open('https://www.haisuperhero.com', '_blank');
                return;
            }
        }

        function filterPersonalTab(type, element) {
            document.querySelectorAll('#personalProfilePage .profile-tab-btn').forEach(btn => btn.classList.remove('active'));
            if (element) element.classList.add('active');

            const activeDivisionFeed = document.getElementById('softwareSection')?.style.display !== 'none' ?
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


        function closeAllAppOverlaysForFooter() {
            document.body.classList.remove('viewing-other-profile');
            const overlayIds = [
                'buildTeamsOverlay',
                'joinTeamsOverlay',
                'teamChatOverlay',
                'individualOverlay',
                'individualChatOverlay',
                'myselfOverlay',
                'joinNetworkOverlay',
                'networkChatOverlay',
                'authorProfileOverlay',
                'shareAccountsOverlay',
                'userMenuOverlay',
                'workerProfileOverlay',
                'visitorFeedPage',
                'allInfoHubOverlay',
                'all-info-item-detail-page',
                'all-info-add-modal',
                'productHubOverlay',
                'product-item-detail-page',
                'product-add-modal',
                'serviceHubOverlay',
                'service-item-detail-page',
                'service-add-modal',
                'vacancyHubOverlay',
                'vacancy-item-detail-page',
                'vacancy-add-modal',
                'fullScreenViewer',
                'postCommentsOverlay',
                'postCreatorModal',
                'shareModalOverlay',
                'businessEditModal',
                'authorProfileOverlay'
            ];
            overlayIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            const catHdr = document.getElementById('spaceCategoryHeader');
            if (catHdr) catHdr.style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            const up = document.getElementById('userProfilePage');
            if (up) up.style.display = 'none';
            const pp = document.getElementById('personalProfilePage');
            if (pp) pp.style.display = 'none';
            if (typeof window.closeNetworkAccountSwitcher === 'function') window.closeNetworkAccountSwitcher();
            if (typeof window.closeNetworkRecipientMenu === 'function') window.closeNetworkRecipientMenu();
        }

        function filterFeed(type, element) {
            closeAllAppOverlaysForFooter();
            activeView = 'home';
            isMarketOpen = false;
            isJobsOpen = false;
            const _mp = document.getElementById('marketMatrixPage'); if (_mp) _mp.style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
            const _sp = document.getElementById('socialMediaPage'); if (_sp) _sp.style.display = 'flex';
            const _mh = document.getElementById('mainHeader'); if (_mh) _mh.classList.remove('hidden');
            restoreFeedOriginalOrder(document.getElementById('socialFeed'));
            const homeSelected = type === 'all' &&
                element?.querySelector('.footer-label')?.textContent.trim().toUpperCase() === 'HOME';
            setHomeFeedFloatingActionsVisible(homeSelected);

            if (document.getElementById('spaceCategoryHeader').style.display !== 'none') {
                document.getElementById('spaceCategoryHeader').style.display = 'none';
                document.getElementById('spaceCategoryEmpty')?.remove();
                restoreFeedOriginalOrder(document.getElementById('socialFeed'));
                document.getElementById('mainHeader').classList.remove('hidden');
                document.getElementById('marketMatrixPage').style.display = 'none';
                const jp = document.getElementById('jobsMatrixPage');
                if (jp) jp.style.display = 'none';
                isMarketOpen = false;
                isJobsOpen = false;
            }

            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            if (element) element.classList.add('active');

            // Close profile containers if open
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
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
                activeFeedSelector = document.getElementById('softwareSection')?.style.display !== 'none' ?
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
        let isJobsOpen = false;
        let lastMatrixSource = 'market';

        function toggleJobsPage() {
            closeAllAppOverlaysForFooter();
            setHomeFeedFloatingActionsVisible(false);
            const jobsPage = document.getElementById('jobsMatrixPage');
            const marketPage = document.getElementById('marketMatrixPage');
            const socialPage = document.getElementById('socialMediaPage');
            const header = document.getElementById('mainHeader');
            const jobsBtn = document.getElementById('jobsFooterBtn');

            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            document.getElementById('socialFeed').classList.remove('matrix-grid');
            document.querySelectorAll('#socialFeed .social-post-card').forEach(post => post.style.display = 'flex');

            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';

            isMarketOpen = false;
            isJobsOpen = true;
            lastMatrixSource = 'jobs';
            if (marketPage) marketPage.style.display = 'none';
            if (jobsPage) jobsPage.style.display = 'flex';
            if (socialPage) socialPage.style.display = 'none';
            if (header) header.classList.add('hidden');

            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            if (jobsBtn) jobsBtn.classList.add('active');

            window.scrollTo(0, 0);
        }

        function openJobsCategory(subType, title) {
            setHomeFeedFloatingActionsVisible(false);
            const socialPage = document.getElementById('socialMediaPage');
            const feed = document.getElementById('socialFeed');
            const categoryHeader = document.getElementById('spaceCategoryHeader');
            const backBtn = categoryHeader ? categoryHeader.querySelector('button') : null;

            activeView = 'home';
            isMarketOpen = false;
            isJobsOpen = false;
            lastMatrixSource = 'jobs';
            document.getElementById('marketMatrixPage').style.display = 'none';
            const jp = document.getElementById('jobsMatrixPage');
            if (jp) jp.style.display = 'none';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
            socialPage.style.display = 'flex';
            document.getElementById('mainHeader').classList.add('hidden');
            categoryHeader.style.display = 'flex';
            if (backBtn) backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> SPACE';
            document.getElementById('spaceCategoryTitle').textContent = title;
            feed.classList.remove('matrix-grid');

            const normalizeTok = (val) => String(val || '').replace(/^(?:♾️|♾|∞|@|user:|business:|creator:)+/gu, '').trim().toLowerCase();
            const expandedHandles = new Set();
            supportedHandles.forEach(h => {
                const n = normalizeTok(h);
                if (n) expandedHandles.add(n);
            });
            supportedTargets.forEach(t => {
                const n = normalizeTok(t);
                if (n) expandedHandles.add(n);
            });

            const posts = [...feed.querySelectorAll('.social-post-card')];
            let shownCount = 0;
            posts.forEach(post => {
                const authorId = String(post.dataset.authorId || post.dataset.userId || '').trim();
                const authorUsername = normalizeTok(post.dataset.authorUsername || '');
                const h4El = post.querySelector('.post-author-info h4');
                const h4Raw = String(h4El?.textContent || '').trim();
                const h4Norm = normalizeTok(h4Raw);
                const h4SpanNorm = normalizeTok(h4El?.querySelector('span')?.textContent || '');
                const h4FirstWordNorm = normalizeTok(h4Raw.split(/\s+/)[0] || '');

                const supportBtn = post.querySelector('.follow-btn, button[onclick*="toggleSupport"], .support-btn');
                const btnText = String(supportBtn?.textContent || '').trim().toLowerCase();
                const btnTarget = String(supportBtn?.dataset?.supportTarget || '').trim().toLowerCase();
                const btnTargetNorm = normalizeTok(btnTarget || (typeof getFollowButtonTargetKey === 'function' ? getFollowButtonTargetKey(supportBtn) : ''));
                const isBtnSupporting = Boolean(
                    supportBtn && (
                        supportBtn.classList.contains('following') ||
                        supportBtn.classList.contains('supporting') ||
                        btnText.includes('supporting') ||
                        btnText.includes('following')
                    )
                );

                const match =
                    isBtnSupporting ||
                    (authorId && supportedOwnerIds.has(authorId)) ||
                    (authorUsername && expandedHandles.has(authorUsername)) ||
                    (h4Norm && (expandedHandles.has(h4Norm) || supportedTargets.has(h4Raw.toLowerCase()))) ||
                    (h4SpanNorm && expandedHandles.has(h4SpanNorm)) ||
                    (h4FirstWordNorm && expandedHandles.has(h4FirstWordNorm)) ||
                    (btnTarget && supportedTargets.has(btnTarget)) ||
                    (btnTargetNorm && expandedHandles.has(btnTargetNorm));

                post.style.display = match ? 'flex' : 'none';
                if (match) shownCount += 1;
            });

            let emptyMessage = document.getElementById('spaceCategoryEmpty');
            if (!emptyMessage) {
                emptyMessage = document.createElement('p');
                emptyMessage.id = 'spaceCategoryEmpty';
                emptyMessage.style.cssText = 'padding:24px 16px;color:#aaa;text-align:center;';
                feed.after(emptyMessage);
            }
            const anyShown = posts.some(post => post.dataset.type === subType);
            emptyMessage.textContent = anyShown ? '' : `No ${title.toLowerCase()} posts yet.`;
            emptyMessage.style.display = anyShown ? 'none' : 'block';
            feed.style.display = 'flex';
            document.querySelector('.fixed-footer').style.display = 'flex';
            window.scrollTo(0, 0);
        }

        function toggleMarketPage() {
            closeAllAppOverlaysForFooter();
            setHomeFeedFloatingActionsVisible(false);
            const marketPage = document.getElementById('marketMatrixPage');
            const jobsPage = document.getElementById('jobsMatrixPage');
            if (jobsPage) jobsPage.style.display = 'none';
            isJobsOpen = false;
            lastMatrixSource = 'market';
            const socialPage = document.getElementById('socialMediaPage');
            const header = document.getElementById('mainHeader');
            const marketBtn = document.getElementById('marketFooterBtn');

            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('socialFeed').classList.remove('matrix-grid');
            document.querySelectorAll('#socialFeed .social-post-card').forEach(post => post.style.display = 'flex');

            // Close any open profile views
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';

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
            isJobsOpen = false;
            lastMatrixSource = 'market';
            document.getElementById('marketMatrixPage').style.display = 'none';
            const jp = document.getElementById('jobsMatrixPage');
            if (jp) jp.style.display = 'none';
            const backBtn = categoryHeader ? categoryHeader.querySelector('button') : null;
            if (backBtn) backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> JOBS';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
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


        window.openSupportivesFeed = async function () {
            setHomeFeedFloatingActionsVisible(false);
            const socialPage = document.getElementById('socialMediaPage');
            const feed = document.getElementById('socialFeed');
            const categoryHeader = document.getElementById('spaceCategoryHeader');
            const backBtn = categoryHeader ? categoryHeader.querySelector('button') : null;

            activeView = 'home';
            isMarketOpen = false;
            isJobsOpen = false;
            lastMatrixSource = 'jobs';
            document.getElementById('marketMatrixPage').style.display = 'none';
            const jp = document.getElementById('jobsMatrixPage');
            if (jp) jp.style.display = 'none';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
            socialPage.style.display = 'flex';
            document.getElementById('mainHeader').classList.add('hidden');
            categoryHeader.style.display = 'flex';
            if (backBtn) backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> SPACE';
            document.getElementById('spaceCategoryTitle').textContent = 'SUPPORTIVES';
            feed.classList.remove('matrix-grid');

            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            const viewerId = identity?.id || (typeof getCurrentViewerUserId === 'function' ? getCurrentViewerUserId() : '') || '';

            const supportedTargets = new Set();
            const supportedOwnerIds = new Set();
            const supportedHandles = new Set();

            try {
                const [supRes, netRes] = await Promise.all([
                    fetch('/api/support' + (viewerId ? ('?viewer_id=' + encodeURIComponent(viewerId)) : ''), { credentials: 'include', cache: 'no-store' }),
                    fetch('/api/networks?all=true' + (viewerId ? ('&viewer_id=' + encodeURIComponent(viewerId)) : ''), { credentials: 'include', cache: 'no-store' })
                ]);
                if (supRes.ok) {
                    const supJson = await supRes.json();
                    const arr = supJson?.data?.supported_targets || [];
                    arr.forEach(t => {
                        const raw = String(t || '').trim().toLowerCase();
                        if (!raw) return;
                        supportedTargets.add(raw);
                        const stripped = raw.replace(/^(user:|business:|creator:|@)+/, '').trim();
                        if (stripped) {
                            supportedHandles.add(stripped);
                            supportedHandles.add('@' + stripped);
                        }
                    });
                }
                if (netRes.ok) {
                    const netJson = await netRes.json();
                    const nets = Array.isArray(netJson?.data) ? netJson.data : [];
                    nets.filter(n => n && n.is_supported).forEach(n => {
                        if (n.owner_id) supportedOwnerIds.add(String(n.owner_id));
                        const u = String(n.username || '').trim().toLowerCase().replace(/^@+/, '');
                        if (u) {
                            supportedHandles.add(u);
                            supportedHandles.add('@' + u);
                        }
                        const nm = String(n.name || '').trim().toLowerCase();
                        if (nm) supportedHandles.add(nm);
                    });
                }
            } catch {}

            const posts = [...feed.querySelectorAll('.social-post-card')];
            let shownCount = 0;
            posts.forEach(post => {
                const authorId = String(post.dataset.authorId || post.dataset.userId || '').trim();
                const authorUsername = String(post.dataset.authorUsername || '').trim().toLowerCase().replace(/^@+/, '');
                const authorTitle = String(post.querySelector('.post-author-info h4')?.textContent || '').trim().toLowerCase().replace(/^@+/, '');
                const supportBtn = post.querySelector('button[onclick*="toggleSupport"], .support-btn');
                const btnText = String(supportBtn?.textContent || '').trim().toLowerCase();
                const btnTarget = String(supportBtn?.dataset?.supportTarget || '').trim().toLowerCase();
                const isBtnSupporting = Boolean(supportBtn && (supportBtn.classList.contains('supporting') || btnText.includes('supporting')));

                const match =
                    isBtnSupporting ||
                    (authorId && supportedOwnerIds.has(authorId)) ||
                    (authorUsername && supportedHandles.has(authorUsername)) ||
                    (authorTitle && supportedHandles.has(authorTitle)) ||
                    (btnTarget && supportedTargets.has(btnTarget));

                post.style.display = match ? 'flex' : 'none';
                if (match) shownCount += 1;
            });

            let emptyMessage = document.getElementById('spaceCategoryEmpty');
            if (!emptyMessage) {
                emptyMessage = document.createElement('p');
                emptyMessage.id = 'spaceCategoryEmpty';
                emptyMessage.style.cssText = 'padding:24px 16px;color:#aaa;text-align:center;';
                feed.after(emptyMessage);
            }
            emptyMessage.textContent = shownCount > 0 ? '' : 'No posts from supporting accounts yet.';
            emptyMessage.style.display = shownCount > 0 ? 'none' : 'block';
            feed.style.display = 'flex';
            document.querySelector('.fixed-footer').style.display = 'flex';
            window.scrollTo(0, 0);
        };


        function getPostLikeCountForTrending(post) {
            const likeCountEl = post.querySelector('.action-group-left .action-btn .action-count, .post-actions .action-btn .action-count');
            return parseActionCount(likeCountEl?.textContent || '0');
        }

        function getPostTimestampForTrending(post) {
            if (post.dataset.createdAt) {
                const t = Date.parse(post.dataset.createdAt);
                if (!Number.isNaN(t)) return t;
            }
            const dateText = String(post.querySelector('.post-author-info span:last-child')?.textContent || '').replace(/[•·]/g, ' ').trim();
            if (dateText) {
                const parsed = Date.parse(dateText);
                if (!Number.isNaN(parsed)) return parsed;
            }
            return 0;
        }

        function restoreFeedOriginalOrder(feed) {
            if (!feed) return;
            const posts = [...feed.querySelectorAll('.social-post-card')];
            if (!posts.some(p => p.dataset.origOrder !== undefined)) return;
            posts.sort((a, b) => Number(a.dataset.origOrder || 0) - Number(b.dataset.origOrder || 0));
            posts.forEach(p => feed.appendChild(p));
        }

        window.openTrendingFeed = function () {
            setHomeFeedFloatingActionsVisible(false);
            const socialPage = document.getElementById('socialMediaPage');
            const feed = document.getElementById('socialFeed');
            const categoryHeader = document.getElementById('spaceCategoryHeader');
            const backBtn = categoryHeader ? categoryHeader.querySelector('button') : null;

            activeView = 'home';
            isMarketOpen = false;
            isJobsOpen = false;
            lastMatrixSource = 'jobs';
            document.getElementById('marketMatrixPage').style.display = 'none';
            const jp = document.getElementById('jobsMatrixPage');
            if (jp) jp.style.display = 'none';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
            socialPage.style.display = 'flex';
            document.getElementById('mainHeader').classList.add('hidden');
            categoryHeader.style.display = 'flex';
            if (backBtn) backBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> SPACE';
            document.getElementById('spaceCategoryTitle').textContent = 'TRENDING';
            feed.classList.remove('matrix-grid');

            const posts = [...feed.querySelectorAll('.social-post-card')];
            posts.forEach((post, idx) => {
                if (post.dataset.origOrder === undefined) {
                    post.dataset.origOrder = String(idx);
                }
                post.style.display = 'flex';
            });

            posts.sort((a, b) => {
                const likesDiff = getPostLikeCountForTrending(b) - getPostLikeCountForTrending(a);
                if (likesDiff !== 0) return likesDiff;
                return getPostTimestampForTrending(b) - getPostTimestampForTrending(a);
            });

            posts.forEach(post => feed.appendChild(post));

            const emptyMessage = document.getElementById('spaceCategoryEmpty');
            if (emptyMessage) {
                emptyMessage.textContent = posts.length > 0 ? '' : 'No posts yet.';
                emptyMessage.style.display = posts.length > 0 ? 'none' : 'block';
            }

            feed.style.display = 'flex';
            document.querySelector('.fixed-footer').style.display = 'flex';
            window.scrollTo(0, 0);
        };

        function returnToSpaceCategories() {
            setHomeFeedFloatingActionsVisible(false);
            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            document.getElementById('socialMediaPage').style.display = 'none';
            if (lastMatrixSource === 'jobs') {
                document.getElementById('marketMatrixPage').style.display = 'none';
                const jp = document.getElementById('jobsMatrixPage');
                if (jp) jp.style.display = 'flex';
                isMarketOpen = false;
                isJobsOpen = true;
            } else {
                const jp = document.getElementById('jobsMatrixPage');
                if (jp) jp.style.display = 'none';
                document.getElementById('marketMatrixPage').style.display = 'flex';
                isMarketOpen = true;
                isJobsOpen = false;
            }
            document.getElementById('mainHeader').classList.add('hidden');
            const _sf = document.getElementById('socialFeed');
            restoreFeedOriginalOrder(_sf);
            _sf.querySelectorAll('.social-post-card').forEach(post => post.style.display = 'flex');
            document.querySelector('.fixed-footer').style.display = 'flex';
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
                activeFeed = document.getElementById('softwareSection')?.style.display !== 'none' ?
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
            isJobsOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'flex';
            toggleUserPage();
        }

        function toggleCompanyPageFromMarket() {
            isMarketOpen = false;
            isJobsOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
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
                activeFeed = document.getElementById('softwareSection')?.style.display !== 'none' ?
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
                const jp = document.getElementById('jobsMatrixPage');
                if (jp) jp.style.display = 'none';
                isMarketOpen = false;
                isJobsOpen = false;
            }

            document.querySelectorAll('.footer-item').forEach(item => item.classList.remove('active'));
            if (element) element.classList.add('active');

            // Close profile containers if open
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
            document.getElementById('socialFeed').style.display = 'flex';

            // Hide header change-view icons since jobs are shown as direct posts
            document.getElementById('imageHeaderIcon').style.display = 'none';
            document.getElementById('videoHeaderIcon').style.display = 'none';

            let activeFeedSelector = '#socialFeed';
            if (activeView === 'user') {
                activeFeedSelector = '#userFeed';
            } else if (activeView === 'company') {
                activeFeedSelector = document.getElementById('softwareSection')?.style.display !== 'none' ?
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

        window.isInfinityUserAuthenticated = function () {
            try {
                const raw = localStorage.getItem('userData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.profile && parsed.profile.id) return true;
                }
                const sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}');
                if (sessions && Object.values(sessions).some(s => s && s.profile && s.profile.id)) return true;
            } catch {}
            return false;
        };

        window.requireInfinityAuthForPost = function () {
            if (window.isInfinityUserAuthenticated()) return true;
            window.location.href = '/login?type=personal&register=true';
            return false;
        };

        window.populatePostAuthorSelector = function () {
            const authorInput = document.getElementById('newPostAuthor');
            const authorSelect = document.getElementById('newPostAuthorSelect');
            if (!authorInput || !authorSelect) return;

            let sessions = {};
            try {
                sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
            } catch {}

            let activeUserData = null;
            try {
                activeUserData = JSON.parse(localStorage.getItem('userData') || 'null');
            } catch {}

            if (activeUserData && activeUserData.profile) {
                const activeType = activeUserData.profile.account_type || 'personal';
                if (!sessions[activeType]) sessions[activeType] = activeUserData;
            }

            const roleLabels = { personal: 'User', creator: 'Work', business: 'Business' };
            const formatUser = (raw) => {
                const cleaned = String(raw || '').trim().replace(/^(?:♾️|♾|∞|@)+/u, '');
                return cleaned ? '♾️' + cleaned : '';
            };

            const entries = ['personal', 'creator', 'business']
                .filter(t => sessions[t] && sessions[t].profile)
                .map(t => {
                    const p = sessions[t].profile;
                    const uname = formatUser(p.username) || p.display_name || roleLabels[t];
                    return { type: t, username: uname, label: `${uname} (${roleLabels[t]})` };
                });

            const currentType = activeUserData?.profile?.account_type || entries[0]?.type || 'personal';

            if (entries.length > 1) {
                authorSelect.replaceChildren();
                entries.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.type;
                    opt.dataset.username = item.username;
                    opt.textContent = item.label;
                    if (item.type === currentType) opt.selected = true;
                    authorSelect.appendChild(opt);
                });
                const selectedOpt = authorSelect.options[authorSelect.selectedIndex];
                authorInput.value = selectedOpt?.dataset.username || entries[0].username;
                authorInput.style.display = 'none';
                authorSelect.style.display = 'block';
                if (!authorSelect.dataset.bound) {
                    authorSelect.dataset.bound = 'true';
                    authorSelect.addEventListener('change', () => {
                        const opt = authorSelect.options[authorSelect.selectedIndex];
                        authorInput.value = opt?.dataset.username || '';
                    });
                }
            } else if (entries.length === 1) {
                authorSelect.style.display = 'none';
                authorInput.style.display = 'block';
                authorInput.readOnly = true;
                authorInput.value = entries[0].username;
            } else {
                authorSelect.style.display = 'none';
                authorInput.style.display = 'block';
                authorInput.readOnly = false;
                authorInput.value = '';
                authorInput.placeholder = 'Sign in to set username';
            }
        };

        function openPostCreatorModal() {
            window.populatePostAuthorSelector();
            editingSocialPostCard = null;
            document.getElementById('newPostType').disabled = false;
            document.getElementById('submitSocialPostButton').textContent = 'Publish Post';
            document.getElementById('postCreatorModal').style.display = 'flex';
        }

        window.uploadImageToImgBB = async function (file, folder = 'works') {
            if (!file) return '';
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', folder);
            const res = await fetch('/api/worker/upload', {
                method: 'POST',
                credentials: 'include',
                body: fd
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success || !json?.data?.url) {
                const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload images.' : 'ImgBB image upload failed.');
                alert(msg);
                return '';
            }
            return json.data.url;
        };

        window.applyProfileFeedAvatarToDom = function (avatarUrl) {
            const url = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
            ['userInfoSection', 'userFeedSection', 'visitorUserFeedSection', 'infoHubFeedSection', 'userProfileHeaderModalBody'].forEach(containerId => {
                const container = document.getElementById(containerId);
                if (!container) return;
                container.querySelectorAll('[data-feed-avatar-img]').forEach(img => {
                    if (url) {
                        img.src = url;
                        img.style.display = 'block';
                    } else {
                        img.removeAttribute('src');
                        img.style.display = 'none';
                    }
                });
            });
            if (url) {
                const avatarImgHtml = `<img src="${escapeHtml(url)}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;" />`;
                document.querySelectorAll('.header-profile-trigger[data-authenticated="true"]').forEach(trigger => {
                    trigger.innerHTML = avatarImgHtml;
                });
                let activeUid = '';
                try {
                    const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
                    activeUid = String(parsed?.profile?.id || parsed?.user?.id || '').trim();
                } catch {}
                ['#userFeed', '#visitorFeed'].forEach(sel => {
                    document.querySelectorAll(sel + ' .social-post-card:not([data-db-synced="true"]) .post-avatar').forEach(av => {
                        av.innerHTML = avatarImgHtml;
                        av.style.overflow = 'hidden';
                    });
                });
                if (activeUid) {
                    document.querySelectorAll('.social-post-card[data-author-id="' + activeUid + '"]').forEach(card => {
                        card.dataset.authorAvatar = url;
                        const av = card.querySelector(':scope > .post-header > .post-avatar');
                        if (av) {
                            av.innerHTML = avatarImgHtml;
                            av.style.overflow = 'hidden';
                        }
                    });
                }
                try {
                    const raw = localStorage.getItem('userData');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.profile) {
                            parsed.profile.avatar_url = url;
                            localStorage.setItem('userData', JSON.stringify(parsed));
                            const acctType = parsed.profile.account_type || 'personal';
                            const sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
                            if (sessions[acctType] && sessions[acctType].profile) {
                                sessions[acctType].profile.avatar_url = url;
                                localStorage.setItem('infinityAccountSessions', JSON.stringify(sessions));
                            }
                            const uid = String(parsed.profile.id || parsed.user?.id || '').trim();
                            const cachedNets = JSON.parse(localStorage.getItem('myNetworks') || '[]');
                            if (uid && Array.isArray(cachedNets)) {
                                const updatedNets = cachedNets.map(n => (n && String(n.owner_id) === uid ? { ...n, image_url: url } : n));
                                localStorage.setItem('myNetworks', JSON.stringify(updatedNets));
                            }
                        }
                    }
                    networksDbSynced = false;
                } catch {}
            }
        };

        let activeProfileContactCtx = { userId: '', onSaved: null };

        window.applyProfileContactToDom = function (contactData, scopeIds) {
            const phone = String(contactData?.contact_phone || '').trim();
            const email = String(contactData?.contact_email || '').trim();
            const loc = String(contactData?.contact_location || '').trim();
            const targets = Array.isArray(scopeIds) && scopeIds.length > 0
                ? scopeIds
                : ['userInfoSection', 'userFeedSection', 'visitorUserFeedSection', 'userProfileHeaderModalBody'];
            targets.forEach(id => {
                const container = document.getElementById(id);
                if (!container) return;
                const isRo = Boolean(container.querySelector('.profile-contact-icons-row[data-readonly="true"]'));
                container.querySelectorAll('[data-contact-kind="phone"]').forEach(pBtn => {
                    pBtn.dataset.contactValue = phone;
                    pBtn.classList.toggle('empty-readonly', Boolean(isRo && !phone));
                });
                container.querySelectorAll('[data-contact-kind="email"]').forEach(eBtn => {
                    eBtn.dataset.contactValue = email;
                    eBtn.classList.toggle('empty-readonly', Boolean(isRo && !email));
                });
                container.querySelectorAll('[data-contact-kind="location"]').forEach(lBtn => {
                    lBtn.dataset.contactValue = loc;
                    lBtn.classList.toggle('empty-readonly', Boolean(isRo && !loc));
                });
            });
        };

        window.openProfileContactRedirect = function (kind, rawValue) {
            const val = String(rawValue || '').trim();
            if (!val) {
                const label = kind === 'phone' ? 'Phone number' : (kind === 'email' ? 'Mail' : 'Location');
                alert(label + ' not added by this account yet.');
                return;
            }
            if (kind === 'phone') {
                window.location.href = 'tel:' + val.replace(/\s+/g, '');
            } else if (kind === 'email') {
                window.location.href = 'mailto:' + val;
            } else if (kind === 'location') {
                const mapUrl = /^https?:\/\//i.test(val)
                    ? val
                    : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(val));
                window.open(mapUrl, '_blank', 'noopener,noreferrer');
            }
        };

        window.handlePostContactAction = async function (kind, btnEl) {
            const card = btnEl?.closest('.social-post-card');
            if (!card) return;
            let phone = String(card.dataset.authorPhone || '').trim();
            let email = String(card.dataset.authorEmail || '').trim();
            let loc = String(card.dataset.authorLocation || '').trim();
            const _wpOverlay = document.getElementById('workerProfileOverlay'); const _wpActiveId = (_wpOverlay && _wpOverlay.style.display !== 'none') ? _wpOverlay.dataset?.activeAuthorId : ''; const authorId = String(card.dataset.authorId || card.dataset.userId || _wpActiveId || document.getElementById('authorProfileOverlay')?.dataset?.activeAuthorId || '').trim();

            if (!phone && !email && !loc && authorId && UUID_REGEX.test(authorId)) {
                try {
                    const res = await fetch('/api/profile/contact?user_id=' + encodeURIComponent(authorId), { credentials: 'include', cache: 'no-store' });
                    if (res.ok) {
                        const j = await res.json();
                        if (j?.success && j.data) {
                            phone = String(j.data.contact_phone || '').trim();
                            email = String(j.data.contact_email || '').trim();
                            loc = String(j.data.contact_location || '').trim();
                            card.dataset.authorPhone = phone;
                            card.dataset.authorEmail = email;
                            card.dataset.authorLocation = loc;
                        }
                    }
                } catch {}
            }

            if (kind === 'phone') {
                if (!phone) { alert('Phone number not added by this account yet.'); return; }
                window.location.href = 'tel:' + phone.replace(/\s+/g, '');
            } else if (kind === 'email') {
                if (!email) { alert('Mail not added by this account yet.'); return; }
                window.location.href = 'mailto:' + email;
            } else if (kind === 'location') {
                if (!loc) { alert('Location not added by this account yet.'); return; }
                const mapUrl = /^https?:\/\//i.test(loc)
                    ? loc
                    : ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(loc));
                window.open(mapUrl, '_blank', 'noopener,noreferrer');
            } else if (kind === 'whatsapp') {
                if (!phone) { alert('WhatsApp number not added by this account yet.'); return; }
                const rawDigits = phone.replace(/[^0-9]/g, '');
                if (!rawDigits) { alert('WhatsApp number not valid.'); return; }
                const digits = rawDigits.length === 10 ? ('91' + rawDigits) : rawDigits;
                window.open('https://wa.me/' + digits, '_blank', 'noopener,noreferrer');
            }
        };

        window.openProfileContactModal = function (focusKind, prefillData, onSaved) {
            const modal = document.getElementById('profileContactEditModal');
            if (!modal) return;
            let activeUid = String(prefillData?.userId || '').trim();
            let storedProfile = {};
            try {
                const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
                if (parsed?.profile) {
                    storedProfile = parsed.profile;
                    if (!activeUid) activeUid = String(parsed.profile.id || parsed.user?.id || '').trim();
                }
            } catch {}
            activeProfileContactCtx = { userId: activeUid, onSaved: typeof onSaved === 'function' ? onSaved : null };

            const phoneInput = document.getElementById('pcEditPhone');
            const emailInput = document.getElementById('pcEditEmail');
            const locInput = document.getElementById('pcEditLocation');
            const statusEl = document.getElementById('pcEditStatus');
            if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }

            if (phoneInput) phoneInput.value = prefillData?.contact_phone ?? storedProfile.contact_phone ?? '';
            if (emailInput) emailInput.value = prefillData?.contact_email ?? storedProfile.contact_email ?? '';
            if (locInput) locInput.value = prefillData?.contact_location ?? storedProfile.contact_location ?? '';

            modal.style.display = 'flex';
            setTimeout(() => {
                if (focusKind === 'phone' && phoneInput) phoneInput.focus();
                else if (focusKind === 'email' && emailInput) emailInput.focus();
                else if (focusKind === 'location' && locInput) locInput.focus();
            }, 30);
        };

        window.closeProfileContactModal = function () {
            const modal = document.getElementById('profileContactEditModal');
            if (modal) modal.style.display = 'none';
        };

        window.saveProfileContactModal = async function () {
            const phone = (document.getElementById('pcEditPhone')?.value || '').trim();
            const email = (document.getElementById('pcEditEmail')?.value || '').trim();
            const loc = (document.getElementById('pcEditLocation')?.value || '').trim();
            const statusEl = document.getElementById('pcEditStatus');
            const saveBtn = document.getElementById('pcEditSaveBtn');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
            try {
                const res = await fetch('/api/profile/contact', {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: activeProfileContactCtx.userId || undefined,
                        contact_phone: phone,
                        contact_email: email,
                        contact_location: loc
                    })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json?.success) {
                    if (statusEl) {
                        statusEl.textContent = json?.error?.message || 'Failed to save contact details.';
                        statusEl.style.display = 'block';
                    }
                    return;
                }
                const saved = json.data || { contact_phone: phone, contact_email: email, contact_location: loc };
                window.applyProfileContactToDom(saved);
                try {
                    const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
                    if (parsed?.profile) {
                        parsed.profile.contact_phone = saved.contact_phone || '';
                        parsed.profile.contact_email = saved.contact_email || '';
                        parsed.profile.contact_location = saved.contact_location || '';
                        localStorage.setItem('userData', JSON.stringify(parsed));
                        const acctType = parsed.profile.account_type || 'personal';
                        const sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
                        if (sessions[acctType]?.profile) {
                            sessions[acctType].profile.contact_phone = saved.contact_phone || '';
                            sessions[acctType].profile.contact_email = saved.contact_email || '';
                            sessions[acctType].profile.contact_location = saved.contact_location || '';
                            localStorage.setItem('infinityAccountSessions', JSON.stringify(sessions));
                        }
                    }
                } catch {}
                if (activeProfileContactCtx.onSaved) {
                    activeProfileContactCtx.onSaved(saved);
                }
                window.closeProfileContactModal();
            } catch {
                if (statusEl) {
                    statusEl.textContent = 'Network error while saving.';
                    statusEl.style.display = 'block';
                }
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
            }
        };

        window.handleProfileContactIconClick = function (kind, btnEl) {
            const isReadOnly = Boolean(btnEl?.closest('#authorProfileOverlay') || btnEl?.closest('[data-readonly="true"]'));
            if (isReadOnly) {
                window.openProfileContactRedirect(kind, btnEl?.dataset?.contactValue || '');
                return;
            }
            const container = btnEl?.closest('#visitorUserFeedSection, #userFeedSection');
            const pVal = container?.querySelector('[data-contact-kind="phone"]')?.dataset?.contactValue;
            const eVal = container?.querySelector('[data-contact-kind="email"]')?.dataset?.contactValue;
            const lVal = container?.querySelector('[data-contact-kind="location"]')?.dataset?.contactValue;
            window.openProfileContactModal(kind, {
                contact_phone: pVal,
                contact_email: eVal,
                contact_location: lVal
            });
        };

        window.handleProfileFeedAvatarUpload = async function (input) {
            const file = input && input.files && input.files[0];
            if (!file) return;
            const url = await window.uploadImageToImgBB(file, 'profile');
            if (!url) return;
            window.applyProfileFeedAvatarToDom(url);
            try {
                let activeUid = '';
                try {
                    const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
                    activeUid = String(parsed?.profile?.id || parsed?.user?.id || '').trim();
                } catch {}
                const res = await fetch('/api/profile/avatar', {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar_url: url, user_id: activeUid || undefined })
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json?.success) {
                    alert(json?.error?.message || 'Failed to save profile image.');
                }
            } catch {
                alert('Failed to save profile image.');
            }
        };

        window.handleGetProClick = function () {
            alert('Infinity Pro: Upgrade to Pro to upload videos longer than 30 seconds and unlock Pro creator features.');
        };

        window.validateVideoDuration30Sec = function (file) {
            return new Promise((resolve) => {
                if (!file) {
                    resolve({ valid: false, duration: 0, error: 'No video file selected.' });
                    return;
                }
                const video = document.createElement('video');
                video.preload = 'metadata';
                const objectUrl = URL.createObjectURL(file);
                let settled = false;
                const finish = (result) => {
                    if (settled) return;
                    settled = true;
                    URL.revokeObjectURL(objectUrl);
                    resolve(result);
                };
                video.onloadedmetadata = () => {
                    const duration = Number(video.duration);
                    if (!Number.isFinite(duration) || duration <= 0) {
                        finish({ valid: false, duration: 0, error: 'Could not determine video duration.' });
                        return;
                    }
                    if (duration > 30.05) {
                        finish({
                            valid: false,
                            duration,
                            error: `Video is ${Math.round(duration)}s long. Only videos up to 30 seconds are allowed. Click "Get Pro" to upload longer videos.`
                        });
                        return;
                    }
                    finish({ valid: true, duration });
                };
                video.onerror = () => {
                    finish({ valid: false, duration: 0, error: 'Invalid or unsupported video file.' });
                };
                video.src = objectUrl;
            });
        };

        window.uploadVideoToStorage = async function (file, folder = 'works') {
            if (!file) return '';
            const check = await window.validateVideoDuration30Sec(file);
            if (!check.valid) {
                alert(check.error);
                return '';
            }
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', folder);
            const res = await fetch('/api/worker/upload', {
                method: 'POST',
                credentials: 'include',
                body: fd
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success || !json?.data?.url) {
                const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload videos.' : 'Video upload failed.');
                alert(msg);
                return '';
            }
            return json.data.url;
        };

        window.toggleNewPostMediaInputs = function () {
            const typeEl = document.getElementById('newPostType');
            const imgWrap = document.getElementById('newPostImageUploadWrap');
            const vidWrap = document.getElementById('newPostVideoUploadWrap');
            const audWrap = document.getElementById('newPostAudioUploadWrap');
            const fileWrap = document.getElementById('newPostFileUploadWrap');
            const urlWrap = document.getElementById('newPostMediaUrlWrap');
            if (!typeEl || !imgWrap || !urlWrap) return;
            const val = typeEl.value;
            const isVideo = val === 'video';
            const isAudio = val === 'audio';
            const isFile = val === 'file';
            const isText = val === 'text';
            imgWrap.style.display = (isText || isVideo || isAudio || isFile) ? 'none' : 'block';
            if (vidWrap) vidWrap.style.display = isVideo ? 'block' : 'none';
            if (audWrap) audWrap.style.display = isAudio ? 'block' : 'none';
            if (fileWrap) fileWrap.style.display = isFile ? 'block' : 'none';
            urlWrap.style.display = 'none';
        };

        window.revealNewPostVideoOptions = function () {
            const chooseBtn = document.getElementById('newPostChooseVideoBtn');
            const optionsRow = document.getElementById('newPostVideoOptionsRow');
            if (chooseBtn) chooseBtn.style.display = 'none';
            if (optionsRow) optionsRow.style.display = 'flex';
        };

        window.revealNewPostVideoUrlInput = function () {
            const urlRow = document.getElementById('newPostVideoUrlRow');
            const urlInput = document.getElementById('newPostVideoUrlInput');
            if (urlRow) {
                urlRow.style.display = 'flex';
                urlInput?.focus();
            }
        };

        window.syncNewPostVideoUrl = function (val) {
            const mainUrlInput = document.getElementById('newPostMediaUrl');
            if (mainUrlInput) mainUrlInput.value = val;
        };

        window.applyNewPostVideoUrl = function () {
            const urlInput = document.getElementById('newPostVideoUrlInput');
            const mainUrlInput = document.getElementById('newPostMediaUrl');
            const preview = document.getElementById('newPostVideoPreview');
            const rawUrl = (urlInput?.value || mainUrlInput?.value || '').trim();
            if (!rawUrl) return;
            if (mainUrlInput) mainUrlInput.value = rawUrl;
            if (preview) {
                preview.innerHTML = `<video controls playsinline preload="metadata" src="${normalizeExternalMediaUrl(rawUrl)}" style="width:100%;max-height:180px;border-radius:8px;margin-top:8px;background:#000;display:block;"></video>`;
            }
        };

        window.handleNewPostVideoUpload = async function (input) {
            const file = input?.files && input.files[0];
            if (!file) return;
            const preview = document.getElementById('newPostVideoPreview');
            const urlInput = document.getElementById('newPostMediaUrl');
            if (preview) {
                preview.innerHTML = '<span style="font-size:0.8rem;color:#00f0ff;">Checking video duration (max 30s)...</span>';
            }
            const check = await window.validateVideoDuration30Sec(file);
            if (!check.valid) {
                input.value = '';
                if (preview) {
                    preview.innerHTML = `<span style="font-size:0.8rem;color:#ff6b6b;">${escapeHtml(check.error)}</span>`;
                }
                alert(check.error);
                return;
            }
            if (preview) {
                preview.innerHTML = '<span style="font-size:0.8rem;color:#00f0ff;">Uploading 30s video...</span>';
            }
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', 'works');
            const res = await fetch('/api/worker/upload', {
                method: 'POST',
                credentials: 'include',
                body: fd
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success || !json?.data?.url) {
                const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload videos.' : 'Video upload failed.');
                input.value = '';
                if (preview) preview.innerHTML = `<span style="font-size:0.8rem;color:#ff6b6b;">${escapeHtml(msg)}</span>`;
                alert(msg);
                return;
            }
            const url = json.data.url;
            if (urlInput) urlInput.value = url;
            if (preview && url) {
                preview.innerHTML = `<video controls playsinline preload="metadata" src="${url}" style="width:100%;max-height:180px;border-radius:8px;margin-top:8px;background:#000;display:block;"></video>`;
            }
        };


        window.handleNewPostAudioUpload = async function (input) {
            const file = input?.files && input.files[0];
            if (!file) return;
            const preview = document.getElementById('newPostAudioPreview');
            const urlInput = document.getElementById('newPostMediaUrl');
            const audioUrlInput = document.getElementById('newPostAudioUrlInput');
            if (preview) {
                preview.style.display = 'block';
                preview.innerHTML = '<span style="font-size:0.8rem;color:#00f0ff;">Uploading audio...</span>';
            }
            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            const fd = new FormData();
            fd.append('file', file);
            if (identity?.id) fd.append('owner_id', identity.id);
            try {
                const res = await fetch('/api/media/upload-file', { method: 'POST', credentials: 'include', body: fd });
                const json = await res.json().catch(() => ({}));
                const url = json?.data?.url || '';
                if (!res.ok || !url) {
                    if (preview) preview.innerHTML = '<span style="font-size:0.8rem;color:#ff6b6b;">Upload failed.</span>';
                    return;
                }
                if (urlInput) urlInput.value = url;
                if (audioUrlInput) audioUrlInput.value = url;
                if (preview) {
                    preview.style.display = 'block';
                    preview.innerHTML = `<audio src="${url}" controls style="width:100%;margin-top:6px;"></audio>`;
                }
            } catch {
                if (preview) preview.innerHTML = '<span style="font-size:0.8rem;color:#ff6b6b;">Upload failed.</span>';
            }
        };

        window.handleNewPostFileUpload = async function (input) {
            const file = input?.files && input.files[0];
            if (!file) return;
            const preview = document.getElementById('newPostFilePreview');
            const urlInput = document.getElementById('newPostMediaUrl');
            const fileUrlInput = document.getElementById('newPostFileUrlInput');
            if (preview) {
                preview.style.display = 'block';
                preview.innerHTML = '<span style="font-size:0.8rem;color:#00f0ff;">Uploading file...</span>';
            }
            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            const fd = new FormData();
            fd.append('file', file);
            if (identity?.id) fd.append('owner_id', identity.id);
            try {
                const res = await fetch('/api/media/upload-file', { method: 'POST', credentials: 'include', body: fd });
                const json = await res.json().catch(() => ({}));
                const url = json?.data?.url || '';
                if (!res.ok || !url) {
                    if (preview) preview.innerHTML = '<span style="font-size:0.8rem;color:#ff6b6b;">Upload failed.</span>';
                    return;
                }
                if (urlInput) urlInput.value = url;
                if (fileUrlInput) fileUrlInput.value = url;
                if (preview) {
                    preview.style.display = 'block';
                    preview.innerHTML = `<div style="padding:8px 10px;background:rgba(0,240,255,0.1);border-radius:6px;color:#fff;font-size:0.85rem;"><i class="fa-solid fa-file-lines" style="color:#00f0ff;margin-right:6px;"></i>${escapeHtml(file.name)}</div>`;
                }
            } catch {
                if (preview) preview.innerHTML = '<span style="font-size:0.8rem;color:#ff6b6b;">Upload failed.</span>';
            }
        };

        window.handleNewPostImageUpload = async function (input) {
            const file = input?.files && input.files[0];
            if (!file) return;
            const preview = document.getElementById('newPostImagePreview');
            const urlInput = document.getElementById('newPostMediaUrl');
            if (preview) {
                preview.style.display = 'block';
                preview.innerHTML = '<span style="font-size:0.8rem;color:#00f0ff;">Uploading image...</span>';
            }
            const url = await window.uploadImageToImgBB(file, 'works');
            if (urlInput) urlInput.value = url;
            if (preview && url) {
                preview.style.display = 'block';
                preview.innerHTML = `<img src="${url}" alt="Uploaded preview" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #333;">`;
            }
        };

        (function bindNewPostTypeToggle() {
            const bind = () => {
                const typeEl = document.getElementById('newPostType');
                if (typeEl && !typeEl.dataset.imgbbBound) {
                    typeEl.dataset.imgbbBound = 'true';
                    typeEl.addEventListener('change', window.toggleNewPostMediaInputs);
                    window.toggleNewPostMediaInputs();
                }
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', bind);
            } else {
                bind();
            }
        })();

        function closePostCreatorModal() {
            const imgFile = document.getElementById('newPostImageFile');
            const imgPreview = document.getElementById('newPostImagePreview');
            if (imgFile) imgFile.value = '';
            if (imgPreview) { imgPreview.style.display = 'none'; imgPreview.innerHTML = ''; }
            const vidFile = document.getElementById('newPostVideoFile');
            const vidPreview = document.getElementById('newPostVideoPreview');
            const vidUrlInput = document.getElementById('newPostVideoUrlInput');
            const vidUrlRow = document.getElementById('newPostVideoUrlRow');
            if (vidFile) vidFile.value = '';
            if (vidPreview) vidPreview.innerHTML = '';
            if (vidUrlInput) vidUrlInput.value = '';
            if (vidUrlRow) vidUrlRow.style.display = 'none';
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
                    <div class="post-avatar" style="background: linear-gradient(135deg, #00ff66, #00f0ff); overflow:hidden;">${(() => { try { const u = JSON.parse(localStorage.getItem("userData") || "null"); const av = u?.profile?.avatar_url; return av ? `<img src="${escapeHtml(av)}" alt="${escapeHtml(author)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />` : escapeHtml(initials); } catch { return escapeHtml(initials); } })()}</div>
                    <div class="post-author-info">
                        <h4>${escapeHtml(author)} ${categoryLabel}</h4>
                        <span>Just Now • 1 min read</span>
                    </div>
                    <button class="follow-btn" onclick="toggleFollow(this)">+ SUPPORT</button>
                    ${editButton}
                </div>
                <p class="post-text">${escapeHtml(text)}</p>
                ${getSocialPostMediaHtml(type, mediaUrl)}
                <div class="post-actions">
                    <div class="action-group-left">
                        <button class="action-btn" onclick="toggleLike(this)"><i class="fa-regular fa-heart"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="alert('Opening comments...')"><i class="fa-regular fa-comment"></i><span class="action-count">0</span></button>
                        <button class="action-btn" onclick="toggleRepost(this)"><i class="fa-solid fa-retweet"></i><span class="action-count">0</span></button>
                    </div>
                    <div class="action-group-right">
                        <button class="action-btn" onclick="handlePostContactAction('phone', this)" title="Phone"><i class="fa-solid fa-phone"></i></button>
                        <button class="action-btn" onclick="handlePostContactAction('email', this)" title="Mail"><i class="fa-solid fa-envelope"></i></button>
                        <button class="action-btn" onclick="handlePostContactAction('location', this)" title="Location"><i class="fa-solid fa-location-dot"></i></button>
                        <button class="action-btn" onclick="handlePostContactAction('whatsapp', this)" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                        <button class="action-btn" onclick="openShareModal(this)" title="Share"><i class="fa-regular fa-paper-plane"></i></button>
                        <button class="action-btn" onclick="downloadPostMedia(this)" title="Download"><i class="fa-solid fa-download"></i></button>
                    </div>
                </div>
            `;
            return newCard;
        }

        // Build and Insert New Social Post Card Dynamically
        function submitNewSocialPost() {
            if (!window.requireInfinityAuthForPost()) return;
            const type = document.getElementById('newPostType').value;
            const authorSelect = document.getElementById('newPostAuthorSelect');
            let author = document.getElementById('newPostAuthor').value.trim() || 'User';
            if (authorSelect && authorSelect.style.display !== 'none' && authorSelect.options.length > 0) {
                const selectedOpt = authorSelect.options[authorSelect.selectedIndex];
                const selectedType = authorSelect.value;
                author = selectedOpt?.dataset.username || author;
                try {
                    const sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
                    if (sessions[selectedType] && sessions[selectedType].profile) {
                        localStorage.setItem('userData', JSON.stringify(sessions[selectedType]));
                    }
                } catch {}
            }
            const textEl = document.getElementById('newPostText');
            const text = textEl.value.trim();
            const richHtml = textEl.dataset.richHtml || '';
            const richBg = textEl.dataset.richBg || '';
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
                const editPostText = post.querySelector('.post-text');
                if (richHtml) {
                    editPostText.innerHTML = richHtml;
                    if (richBg && richBg.toLowerCase() !== '#ffffff') {
                        editPostText.style.backgroundColor = richBg;
                        editPostText.style.padding = '10px';
                        editPostText.style.color = '#111';
                    }
                } else {
                    editPostText.textContent = text;
                }
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
                if (richHtml) {
                    const postTextEl = newCard.querySelector('.post-text');
                    if (postTextEl) {
                        postTextEl.innerHTML = richHtml;
                        if (richBg && richBg.toLowerCase() !== '#ffffff') {
                            postTextEl.style.backgroundColor = richBg;
                            postTextEl.style.padding = '10px';
                            postTextEl.style.color = '#111';
                        }
                    }
                }
                const feedContainer = document.getElementById('socialFeed');
                feedContainer.prepend(newCard);
                const dbContent = richHtml
                    ? (richBg && richBg.toLowerCase() !== '#ffffff'
                        ? `<div class="infinity-rich-post" style="background-color:${richBg}; padding:10px; border-radius:8px; color:#111;">${richHtml}</div>`
                        : richHtml)
                    : text;
                void savePostCardToDatabase(newCard, postType, dbContent, mediaUrl || null).then(() => {
                    if (typeof window.renderDbFeedInto === 'function') {
                        void window.renderDbFeedInto('visitorFeed', 'mine');
                        void window.renderDbFeedInto('userFeed', 'mine');
                    }
                });

                if (['service', 'product', 'vacancy'].includes(type)) {
                    const title = text.split(/\r?\n/)[0].slice(0, 60) || `${getCategoryTitle(type)} by ${author}`;
                    const subtitle = `${getCategoryTitle(type)} • Added from home`;
                    const placeholderImage = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
                    newCard.dataset.businessListingId = addBusinessListing(type, title, subtitle, text, mediaUrl || placeholderImage);
                }
            }

            activeView = 'home';
            isMarketOpen = false;
            isJobsOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
            document.getElementById('visitorFeedPage').style.display = 'none';
            document.getElementById('spaceCategoryHeader').style.display = 'none';
            document.getElementById('spaceCategoryEmpty')?.remove();
            document.getElementById('socialMediaPage').style.display = 'flex';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
            document.getElementById('socialFeed').classList.remove('matrix-grid');
            document.getElementById('socialFeed').querySelectorAll('.social-post-card').forEach(post => post.style.display = 'flex');
            document.getElementById('socialFeed').style.display = 'flex';
            document.getElementById('mainHeader').classList.remove('hidden');
            document.querySelector('.fixed-footer').style.display = 'flex';

            editingSocialPostCard = null;
            document.getElementById('newPostType').disabled = false;
            document.getElementById('submitSocialPostButton').textContent = 'Publish Post';
            textEl.value = '';
            delete textEl.dataset.richHtml;
            delete textEl.dataset.richBg;
            document.getElementById('newPostMediaUrl').value = '';
            const _imgFile = document.getElementById('newPostImageFile');
            const _imgPreview = document.getElementById('newPostImagePreview');
            if (_imgFile) _imgFile.value = '';
            if (_imgPreview) { _imgPreview.style.display = 'none'; _imgPreview.innerHTML = ''; }
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

        async function handleProductImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            productUploadedImgUrl = await window.uploadImageToImgBB(file, 'works');
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

        async function handleServiceImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            serviceUploadedImgUrl = await window.uploadImageToImgBB(file, 'works');
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

        async function handleVacancyImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            vacancyUploadedImgUrl = await window.uploadImageToImgBB(file, 'works');
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

        /* Open the custom menu overlay when logged out, or jump directly to the user's respective page when logged in */
        function openUserMenuOverlay() {
            const overlay = document.getElementById('userMenuOverlay');
            if (overlay && overlay.dataset.authMode === 'logged-in' && typeof window.openMyProfileFromMenu === 'function') {
                window.openMyProfileFromMenu();
                return;
            }
            if (overlay) overlay.style.display = 'flex';
        }

        /* Close the custom menu overlay */
        function closeUserMenuOverlay() {
            document.getElementById('userMenuOverlay').style.display = 'none';
        }

        function openWorkerProfilePage() {
            const workerProfileFrame = document.getElementById('workerProfileFrame');
            if (!workerProfileFrame.hasAttribute('srcdoc') || workerProfileFrame.dataset.readonlyMode === 'true') {
                const workerProfileSource = document.getElementById('workerProfileDocumentSource').content.textContent;
                if (!workerProfileSource) {
                    console.error('Unable to open the worker profile: embedded page source is missing.');
                    return;
                }
                workerProfileFrame.dataset.readonlyMode = 'false';
                workerProfileFrame.srcdoc = workerProfileSource;
            }
            document.getElementById('workerProfileOverlay').style.display = 'block';
            try { localStorage.setItem('infinityActivePageView', 'creator'); } catch {}
        }

        function closeWorkerProfilePage() {
            document.getElementById('workerProfileOverlay').style.display = 'none';
            document.body.classList.remove('viewing-other-profile'); const _ff = document.querySelector('.fixed-footer'); if (_ff) _ff.style.display = 'flex';
            try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
        }



        function normalizeExternalMediaUrl(rawUrl) {
            try {
                const u = new URL(String(rawUrl || '').trim());
                const driveMatch = u.hostname.includes('drive.google.com') && u.pathname.match(/\/file\/d\/([^/]+)/);
                if (driveMatch) return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
                const driveOpenId = u.hostname.includes('drive.google.com') ? u.searchParams.get('id') : null;
                if (driveOpenId) return `https://lh3.googleusercontent.com/d/${driveOpenId}`;
                if (u.hostname.includes('dropbox.com')) {
                    u.searchParams.delete('dl');
                    u.searchParams.set('raw', '1');
                    return u.toString();
                }
                if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
                    return `https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}`;
                }
                return u.toString();
            } catch {
                return String(rawUrl || '').trim();
            }
        }


        function getVideoEmbedUrl(rawUrl) {
            try {
                const u = new URL(String(rawUrl || '').trim());
                if (u.hostname.includes('youtube.com')) {
                    if (u.pathname.startsWith('/embed/')) return u.toString();
                    if (u.pathname.startsWith('/shorts/')) {
                        const id = u.pathname.split('/')[2];
                        if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
                    }
                    const v = u.searchParams.get('v');
                    if (v) return `https://www.youtube.com/embed/${v}?rel=0`;
                }
                if (u.hostname === 'youtu.be') {
                    const id = u.pathname.replace(/^\//, '').split('/')[0];
                    if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
                }
                if (u.hostname.includes('vimeo.com')) {
                    const id = u.pathname.replace(/^\//, '').split('/')[0];
                    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
                }
                if (u.hostname.includes('drive.google.com')) {
                    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
                    const id = m?.[1] || u.searchParams.get('id');
                    if (id) return `https://drive.google.com/file/d/${id}/preview`;
                }
            } catch {}
            return null;
        }

        window.handleInfinityMediaError = function (el, originalUrl, mediaType) {
            if (!el) return;
            if (!el.dataset.proxyTried) {
                el.dataset.proxyTried = '1';
                el.src = `/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
                if (typeof el.load === 'function') el.load();
                return;
            }
            const link = document.createElement('a');
            link.href = originalUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `Open ${mediaType || 'media'} link ↗`;
            link.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid rgba(57,232,244,0.4); border-radius:8px; color:#39e8f4; text-decoration:none; font-size:0.85rem;';
            el.replaceWith(link);
        };

        window.handleInfinityImageError = function (img, originalUrl) {
            if (!img) return;
            if (!img.dataset.proxyTried) {
                img.dataset.proxyTried = '1';
                img.src = `/api/media/proxy?url=${encodeURIComponent(originalUrl)}`;
                return;
            }
            const link = document.createElement('a');
            link.href = originalUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Open image link ↗';
            link.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:10px 14px; border:1px solid rgba(57,232,244,0.4); border-radius:8px; color:#39e8f4; text-decoration:none; font-size:0.85rem;';
            img.replaceWith(link);
        };

        function serializeRichPostElement(el) {
            if (!el) return '';
            const plain = (el.innerText || el.textContent || '').trim();
            const html = (el.innerHTML || '').trim();
            if (!plain && !html) return '';
            const bg = (el.style?.backgroundColor || '').trim();
            if (bg && bg.toLowerCase() !== '#ffffff' && bg.toLowerCase() !== 'rgb(255, 255, 255)' && bg.toLowerCase() !== 'transparent') {
                return `<div class="infinity-rich-post" style="background-color:${bg}; padding:10px; border-radius:8px; color:#111;">${html}</div>`;
            }
            return html || plain;
        }

        function sanitizeRichPostHtml(rawHtml) {
            const str = String(rawHtml ?? '');
            if (!str) return '';
            if (!/<[a-z][\s\S]*>/i.test(str)) {
                const tmp = document.createElement('span');
                tmp.textContent = str;
                return tmp.innerHTML;
            }
            const tpl = document.createElement('template');
            tpl.innerHTML = str;
            tpl.content.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form').forEach(n => n.remove());
            tpl.content.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const val = attr.value.trim().toLowerCase();
                    if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:text/html')) {
                        el.removeAttribute(attr.name);
                    }
                });
            });
            return tpl.innerHTML;
        }

        async function savePostCardToDatabase(card, postType, contentText, mediaUrl) {
            if (!window.requireInfinityAuthForPost()) return null;
            if (!card) return null;
            const existingId = card.dataset.postId;
            const validTypes = ['text', 'image', 'video', 'audio', 'file', 'service', 'product', 'vacancy', 'job', 'poll'];
            const safeType = validTypes.includes(postType) ? postType : 'text';
            if (safeType === 'text' && !String(contentText || '').trim()) {
                return null;
            }

            try {
                if (existingId && /^[0-9a-f-]{36}$/i.test(existingId)) {
                    const res = await fetch('/api/posts', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            id: existingId,
                            content: contentText !== undefined ? contentText : undefined,
                            media_url: mediaUrl !== undefined ? mediaUrl : undefined
                        })
                    });
                    if (res.ok) {
                        const json = await res.json();
                        return json.data || null;
                    }
                } else {
                    const res = await fetch('/api/posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            type: safeType,
                            content: contentText || '',
                            media_url: mediaUrl || null,
                            visibility: 'public'
                        })
                    });
                    if (res.status === 401) {
                        window.location.href = '/login?type=personal&register=true';
                        return null;
                    }
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && json.data?.id) {
                            card.dataset.postId = json.data.id;
                            return json.data;
                        }
                    }
                }
            } catch (err) {
                console.warn('Could not save post to database:', err);
            }
            return null;
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

                    const preview = document.createElement('div');
                    preview.className = 'profile-feed-media-preview';
                    preview.setAttribute('aria-live', 'polite');

                    if (type === 'file') {
                        const uploadLabel = document.createElement('label');
                        uploadLabel.className = 'profile-feed-upload';
                        uploadLabel.textContent = `Choose ${type}`;

                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = mediaTypes[type].accept;
                        input.setAttribute('aria-label', `Choose ${type} for this post`);
                        input.className = 'profile-feed-media-input';
                        uploadLabel.appendChild(input);
                        editor.append(prompt, uploadLabel, preview);
                    } else if (type === 'video') {
                        const headerRow = document.createElement('div');
                        headerRow.className = 'profile-feed-media-header-row';
                        const titleEl = document.createElement('span');
                        titleEl.className = 'profile-feed-media-title';
                        titleEl.innerHTML = '<i class="fa-solid fa-video"></i><span>Add a video <span class="profile-feed-media-accent">to this post</span></span>';
                        const getProBtn = document.createElement('button');
                        getProBtn.type = 'button';
                        getProBtn.className = 'profile-feed-get-pro-btn';
                        getProBtn.innerHTML = '<i class="fa-solid fa-crown"></i> Get Pro';
                        getProBtn.addEventListener('click', () => window.handleGetProClick());
                        headerRow.append(titleEl, getProBtn);

                        const optionsRow = document.createElement('div');
                        optionsRow.className = 'profile-feed-video-options-row';

                        const directLabel = document.createElement('label');
                        directLabel.className = 'profile-feed-upload profile-feed-video-bar';
                        directLabel.innerHTML = '<span class="profile-feed-video-bar-left"><i class="fa-solid fa-video"></i><span>Add <span class="profile-feed-media-accent">30 sec</span> Video Directly</span></span><i class="fa-solid fa-chevron-right profile-feed-video-bar-chevron"></i>';
                        const directInput = document.createElement('input');
                        directInput.type = 'file';
                        directInput.accept = 'video/*';
                        directInput.setAttribute('aria-label', 'Add 30 sec Video Directly');
                        directLabel.appendChild(directInput);

                        const urlToggleBtn = document.createElement('button');
                        urlToggleBtn.type = 'button';
                        urlToggleBtn.className = 'profile-feed-upload profile-feed-video-bar';
                        urlToggleBtn.innerHTML = '<span class="profile-feed-video-bar-left"><i class="fa-solid fa-link"></i><span>Add URL</span></span><i class="fa-solid fa-chevron-right profile-feed-video-bar-chevron"></i>';

                        optionsRow.append(directLabel, urlToggleBtn);

                        const urlRow = document.createElement('div');
                        urlRow.className = 'profile-feed-url-row';
                        urlRow.style.cssText = 'display:none; gap:8px; width:100%; align-items:center; margin-top:6px;';

                        const urlInput = document.createElement('input');
                        urlInput.type = 'url';
                        urlInput.className = 'profile-feed-url-input';
                        urlInput.placeholder = 'Paste video URL (https://...)';
                        urlInput.setAttribute('aria-label', 'Enter video URL');
                        urlInput.style.cssText = 'flex:1; min-width:0; padding:8px 10px; background:#0b0f17; border:1px solid rgba(0,240,255,0.45); border-radius:6px; color:#fff; font-size:0.85rem; outline:none;';

                        const applyBtn = document.createElement('button');
                        applyBtn.type = 'button';
                        applyBtn.className = 'profile-feed-upload';
                        applyBtn.textContent = 'Add URL';
                        applyBtn.style.cssText = 'flex-shrink:0; font-weight:700;';



                        urlToggleBtn.addEventListener('click', () => {
                            urlRow.style.display = 'flex';
                            urlInput.focus();
                        });

                        directInput.addEventListener('change', async () => {
                            if (!window.requireInfinityAuthForPost()) return;
                            const file = directInput.files && directInput.files[0];
                            if (!file) return;
                            preview.innerHTML = '<div style="padding:10px;color:#00f0ff;font-size:0.85rem;">Checking video duration (max 30s)...</div>';
                            const check = await window.validateVideoDuration30Sec(file);
                            if (!check.valid) {
                                directInput.value = '';
                                preview.innerHTML = `<div style="padding:10px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(check.error)}</div>`;
                                alert(check.error);
                                return;
                            }
                            preview.innerHTML = '<div style="padding:10px;color:#00f0ff;font-size:0.85rem;">Uploading 30s video...</div>';
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('folder', 'works');
                            const res = await fetch('/api/worker/upload', { method: 'POST', credentials: 'include', body: fd });
                            const json = await res.json().catch(() => ({}));
                            if (!res.ok || !json?.success || !json?.data?.url) {
                                const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload videos.' : 'Video upload failed.');
                                directInput.value = '';
                                preview.innerHTML = `<div style="padding:10px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(msg)}</div>`;
                                alert(msg);
                                return;
                            }
                            const mediaUrl = json.data.url;
                            preview.replaceChildren();
                            const media = document.createElement('video');
                            media.src = mediaUrl;
                            media.controls = true;
                            media.playsInline = true;
                            media.style.cssText = 'width:100%; max-height:350px; border-radius:8px; margin-top:8px; display:block; background:#000;';
                            preview.appendChild(media);
                            const card = editor.closest('.social-post-card');
                            const captionText = serializeRichPostElement(card?.querySelector('.post-text')) || '';
                            await savePostCardToDatabase(card, 'video', captionText, mediaUrl);
                        });

                        const applyUrl = async () => {
                            const rawUrl = urlInput.value.trim();
                            if (!rawUrl) return;
                            preview.replaceChildren();
                            const media = document.createElement('video');
                            media.src = normalizeExternalMediaUrl(rawUrl);
                            media.controls = true;
                            media.playsInline = true;
                            media.style.cssText = 'width:100%; max-height:350px; border-radius:8px; margin-top:8px; display:block; background:#000;';
                            preview.appendChild(media);
                            const card = editor.closest('.social-post-card');
                            const captionText = serializeRichPostElement(card?.querySelector('.post-text')) || '';
                            await savePostCardToDatabase(card, 'video', captionText, rawUrl);
                        };

                        applyBtn.addEventListener('click', applyUrl);
                        urlInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                applyUrl();
                            }
                        });

                        urlRow.append(urlInput, applyBtn);
                        editor.append(headerRow, optionsRow, urlRow, preview);
                    } else {
                        const chooseBtn = document.createElement('button');
                        chooseBtn.type = 'button';
                        chooseBtn.className = 'profile-feed-upload';
                        chooseBtn.textContent = `Choose ${type}`;

                        const urlRow = document.createElement('div');
                        urlRow.style.cssText = 'display:none; gap:8px; width:100%; align-items:center; margin-top:6px;';

                        const urlInput = document.createElement('input');
                        urlInput.type = 'url';
                        urlInput.className = 'profile-feed-url-input';
                        urlInput.placeholder = `Paste ${type} URL (https://...)`;
                        urlInput.setAttribute('aria-label', `Enter ${type} URL`);
                        urlInput.style.cssText = 'flex:1; min-width:0; padding:8px 10px; background:#0b0f17; border:1px solid rgba(0,240,255,0.45); border-radius:6px; color:#fff; font-size:0.85rem; outline:none;';

                        const applyBtn = document.createElement('button');
                        applyBtn.type = 'button';
                        applyBtn.className = 'profile-feed-upload';
                        applyBtn.textContent = 'Add URL';
                        applyBtn.style.cssText = 'flex-shrink:0; font-weight:700;';

                        chooseBtn.addEventListener('click', () => {
                            chooseBtn.style.display = 'none';
                            urlRow.style.display = 'flex';
                            urlInput.focus();
                        });

                        const applyUrl = async () => {
                            const rawUrl = urlInput.value.trim();
                            if (!rawUrl) return;
                            preview.replaceChildren();
                            const media = document.createElement(type === 'image' ? 'img' : type);
                            const normalizedUrl = normalizeExternalMediaUrl(rawUrl);
                            media.src = normalizedUrl;
                            media.style.cssText = 'width:100%; max-height:350px; border-radius:8px; margin-top:8px; display:block;';
                            if (type === 'image') {
                                media.referrerPolicy = 'no-referrer';
                                media.onerror = () => window.handleInfinityImageError(media, rawUrl);
                            }
                            if (type === 'image') {
                                media.alt = 'Post image';
                                media.style.objectFit = 'cover';
                            } else {
                                media.controls = true;
                                if (type === 'video') media.playsInline = true;
                            }
                            preview.appendChild(media);
                            const card = editor.closest('.social-post-card');
                            const captionText = serializeRichPostElement(card?.querySelector('.post-text')) || '';
                            await savePostCardToDatabase(card, type, captionText, rawUrl);
                        };

                        applyBtn.addEventListener('click', applyUrl);
                        urlInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                applyUrl();
                            }
                        });

                        urlRow.append(urlInput, applyBtn);
                        editor.append(prompt, chooseBtn, urlRow, preview);
                    }
                    mediaContainer.appendChild(editor);
                } else {
                    card.querySelector('.post-media-container')?.remove();
                    if (type === 'text' && caption && !card.querySelector('.profile-feed-text-actions')) {
                        const textActions = document.createElement('div');
                        textActions.className = 'profile-feed-text-actions';
                        textActions.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:4px;';

                        const statusLabel = document.createElement('span');
                        statusLabel.className = 'profile-feed-save-status';
                        statusLabel.style.cssText = 'font-size:0.78rem; color:#39e8f4; display:none;';

                        const saveTextBtn = document.createElement('button');
                        saveTextBtn.type = 'button';
                        saveTextBtn.className = 'profile-feed-upload';
                        saveTextBtn.textContent = 'Save Post';
                        saveTextBtn.style.cssText = 'min-height:32px; padding:6px 14px; font-size:0.82rem; font-weight:700;';

                        const persistTextPost = async () => {
                            const richContent = serializeRichPostElement(caption);
                            if (!richContent || richContent === card.dataset.lastSavedText) return;
                            saveTextBtn.disabled = true;
                            saveTextBtn.textContent = 'Saving...';
                            const saved = await savePostCardToDatabase(card, 'text', richContent, null);
                            saveTextBtn.disabled = false;
                            saveTextBtn.textContent = 'Save Post';
                            if (saved) {
                                card.dataset.lastSavedText = richContent;
                                statusLabel.textContent = 'Saved';
                                statusLabel.style.display = 'inline';
                                setTimeout(() => { statusLabel.style.display = 'none'; }, 2000);
                            }
                        };

                        saveTextBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            void persistTextPost();
                        });
                        caption.addEventListener('blur', () => {
                            void persistTextPost();
                        });
                        caption.addEventListener('word-editor-save', () => {
                            void persistTextPost();
                        });

                        textActions.append(statusLabel, saveTextBtn);
                        card.querySelector('.post-actions')?.before(textActions);
                    }
                }

                if (type !== 'text' && caption && !caption.dataset.blurSaveBound) {
                    caption.dataset.blurSaveBound = 'true';
                    const saveMediaCaption = () => {
                        if (!card.dataset.postId) return;
                        const richContent = serializeRichPostElement(caption);
                        if (richContent === card.dataset.lastSavedCaption) return;
                        card.dataset.lastSavedCaption = richContent;
                        void savePostCardToDatabase(card, type, richContent, undefined);
                    };
                    caption.addEventListener('blur', saveMediaCaption);
                    caption.addEventListener('word-editor-save', saveMediaCaption);
                }

                card.dataset.profileEditable = 'true';
            });

            if (!feed._profileFeedEditorBound) {
                feed.addEventListener('change', handleProfileFeedMediaSelection);
                feed._profileFeedEditorBound = true;
            }
        }

        function handleProfileFeedMediaSelection(event) {
            if (!window.requireInfinityAuthForPost()) return;
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
            if (type === 'image') {
                preview.innerHTML = '<span style="font-size:0.85rem;color:#00f0ff;">Uploading image...</span>';
                window.uploadImageToImgBB(file, 'works').then((imgbbUrl) => {
                    preview.replaceChildren();
                    if (!imgbbUrl) return;
                    const media = input.ownerDocument.createElement('img');
                    media.src = imgbbUrl;
                    media.alt = file.name;
                    preview.appendChild(media);
                });
                return;
            }
            const media = input.ownerDocument.createElement(type);
            media.src = url;
            media.controls = true;
            if (type === 'video') media.playsInline = true;
            preview.appendChild(media);
        }

        initializeEditableProfileFeed(document.getElementById('userFeed'));

        function getLoggedInProfileForView() {
            try {
                const raw = localStorage.getItem('userData');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.profile) {
                        const p = parsed.profile;
                        const cleaned = String(p.username || '').trim().replace(/^(?:♾️|♾|∞|@)+/u, '');
                        const handle = cleaned ? '♾️' + cleaned : '♾️username';
                        const displayName = p.display_name || handle;
                        const initial = String(p.display_name || cleaned || parsed.user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
                        const avatarUrl = String(p.avatar_url || '').trim();
                        return { displayName, handle, initial, avatarUrl };
                    }
                }
            } catch {}
            return { displayName: 'NAME', handle: '♾️username', initial: 'V', avatarUrl: '' };
        }

        function openVisitorFeedPage() {
            setHomeFeedFloatingActionsVisible(false);
            const visitorContent = document.getElementById('visitorProfileContent');
            if (!visitorContent.hasChildNodes()) {
                const profileFeed = document.getElementById('userFeedSection').cloneNode(true);
                profileFeed.id = 'visitorUserFeedSection';
                profileFeed.style.display = 'block';

                const activity = profileFeed.querySelector('#userActivitySection');
                if (activity) { activity.id = 'visitorActivitySection'; activity.style.display = 'none'; }

                const visitorFeed = profileFeed.querySelector('#userFeed');
                visitorFeed.id = 'visitorFeed';
                initializeEditableProfileFeed(visitorFeed);

                profileFeed.querySelectorAll('.profile-tab-btn').forEach(button => {
                    const filter = button.getAttribute('onclick').match(/filterUserTab\('([^']+)'/);
                    if (filter) button.setAttribute('onclick', `filterVisitorTab('${filter[1]}', this)`);
                });

                visitorContent.appendChild(profileFeed);
            }

            const userInfo = getLoggedInProfileForView();
            const profileFeed = document.getElementById('visitorUserFeedSection');
            if (profileFeed) {
                profileFeed.style.display = 'block';
                const activityTitle = profileFeed.querySelector('.profile-name-title');
                if (activityTitle && activityTitle.firstChild) {
                    activityTitle.firstChild.nodeValue = userInfo.displayName + ' ';
                }
                const handle = profileFeed.querySelector('.profile-handle');
                if (handle) handle.textContent = userInfo.handle;
                const avatarImg = profileFeed.querySelector('[data-feed-avatar-img]');
                if (avatarImg) {
                    if (userInfo.avatarUrl) {
                        avatarImg.src = userInfo.avatarUrl;
                        avatarImg.style.display = 'block';
                    } else {
                        avatarImg.removeAttribute('src');
                        avatarImg.style.display = 'none';
                        fetch('/api/profile/avatar', { credentials: 'include', cache: 'no-store' })
                            .then(r => r.ok ? r.json() : null)
                            .then(j => {
                                if (j?.success && j.data?.avatar_url) {
                                    window.applyProfileFeedAvatarToDom(j.data.avatar_url);
                                }
                            })
                            .catch(() => {});
                    }
                }

                profileFeed.querySelectorAll('.post-avatar').forEach(avatar => {
                    if (userInfo.avatarUrl) {
                        avatar.innerHTML = `<img src="${escapeHtml(userInfo.avatarUrl)}" alt="${escapeHtml(userInfo.displayName)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />`;
                        avatar.style.overflow = 'hidden';
                    } else {
                        avatar.textContent = userInfo.initial;
                    }
                });
                profileFeed.querySelectorAll('.post-author-info h4').forEach(author => {
                    if (author.firstChild) author.firstChild.nodeValue = userInfo.displayName + ' ';
                });
            }

            closeUserMenuOverlay();
            closeAllInfoHub();
            activeView = 'visitor';
            try { localStorage.setItem('infinityActivePageView', 'personal'); } catch {}
            isMarketOpen = false;
            isJobsOpen = false;
            document.getElementById('marketMatrixPage').style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'none';
            document.getElementById('visitorFeedPage').style.display = 'flex';
            fetch('/api/profile/contact', { credentials: 'include', cache: 'no-store' })
                .then(r => r.ok ? r.json() : null)
                .then(j => { if (j?.success && j.data && typeof window.applyProfileContactToDom === 'function') window.applyProfileContactToDom(j.data, ['visitorUserFeedSection']); })
                .catch(() => {});
            if (typeof window.renderDbFeedInto === 'function') { void window.renderDbFeedInto('visitorFeed', 'mine'); }
            document.querySelector('.fixed-footer').style.display = 'none';
            window.scrollTo(0, 0);
        }

        function closeVisitorFeedPage() {
            activeView = 'home';
            try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
            isMarketOpen = false;
            isJobsOpen = false;
            document.getElementById('visitorFeedPage').style.display = 'none';
            document.getElementById('marketMatrixPage').style.display = 'none';
            const _jp = document.getElementById('jobsMatrixPage'); if (_jp) _jp.style.display = 'none';
            document.getElementById('socialMediaPage').style.display = 'flex';
            document.getElementById('userProfilePage').style.display = 'none';
            (document.getElementById('personalProfilePage') || { style: {} }).style.display = 'none';
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

        /* Route every top-left account-menu choice to the shared login page. */
        function selectUserMenuOption(actionType) {
            const routes = {
                'User Login': '/login?type=personal',
                'Register Work': '/login?type=creator&register=true',
                'Register Business': '/login?type=business&register=true'
            };

            const destination = routes[actionType];
            if (!destination) return;

            closeUserMenuOverlay();
            window.location.assign(destination);
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

        function addBusinessListing(type, title, subtitle, description, image, explicitId = '') {
            const views = businessListingViews[type];
            if (!views) throw new Error(`Unknown business listing type: ${type}`);
            const listingId = explicitId || `business-listing-${++nextBusinessListingId}`;
            if (document.querySelector(`.item-card[data-business-listing-id="${listingId}"]`)) {
                return listingId;
            }
            const entry = {
                id: listingId,
                title,
                subtitle,
                description,
                image
            };
            document.getElementById(views.info)?.appendChild(createBusinessListingCard(type, entry, 'info'));
            document.getElementById(views.catalog)?.appendChild(createBusinessListingCard(type, entry, 'catalog'));
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

        function setAllInfoHubReadOnly(overlay, isReadOnly) {
            if (!overlay) return;
            overlay.querySelectorAll('.btn-add-action, [onclick*="handleAllInfoTopAddButtonClick"], [onclick*="openAllInfoAddModal"], [onclick*="EditCard"], [onclick*="editCard"], .edit-card-btn, .fa-pen-to-square').forEach(el => {
                const target = el.tagName === 'I' ? (el.closest('button') || el) : el;
                if (target) {
                    target.disabled = isReadOnly;
                    target.style.display = isReadOnly ? 'none' : '';
                }
            });
        }

        async function openAllInfoHub(options) {
            const overlay = document.getElementById('allInfoHubOverlay');
            if (!overlay) return;
            const targetUid = options && options.userId ? String(options.userId) : '';
            const isReadOnly = Boolean(options && options.readonly && targetUid);

            if (isReadOnly) {
                overlay.style.zIndex = '4700';
                overlay.dataset.readonlyAuthorId = targetUid;
                overlay.style.display = 'block';
                setAllInfoHubReadOnly(overlay, true);
                document.querySelectorAll('#allInfoHubOverlay [data-business-listing-id]').forEach(el => el.remove());
                try {
                    const res = await fetch('/api/business/catalog?user_id=' + encodeURIComponent(targetUid), { credentials: 'include', cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        const defaultImg = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
                        if (json?.success && Array.isArray(json.data)) {
                            json.data.forEach(item => {
                                if (!item || !item.id || !item.item_type) return;
                                addBusinessListing(item.item_type, item.title || '', item.subtitle || '', item.description || '', item.image_url || defaultImg, item.id);
                            });
                            setAllInfoHubReadOnly(overlay, true);
                        }
                    }
                } catch {}
            } else {
                const wasReadOnly = Boolean(overlay.dataset.readonlyAuthorId);
                delete overlay.dataset.readonlyAuthorId;
                overlay.style.zIndex = '4500';
                setAllInfoHubReadOnly(overlay, false);
                overlay.style.display = 'block';
                if (wasReadOnly && typeof syncBusinessCatalogFromDatabase === 'function') {
                    void syncBusinessCatalogFromDatabase();
                }
            }
            window.scrollTo(0, 0);
        }

        function closeAllInfoHub() {
            restoreUserFeedFromInfoHub();
            const overlay = document.getElementById('allInfoHubOverlay');
            if (overlay) {
                const wasReadOnly = Boolean(overlay.dataset.readonlyAuthorId);
                delete overlay.dataset.readonlyAuthorId;
                overlay.style.zIndex = '4500';
                setAllInfoHubReadOnly(overlay, false);
                overlay.style.display = 'none';
                if (wasReadOnly && typeof syncBusinessCatalogFromDatabase === 'function') {
                    void syncBusinessCatalogFromDatabase();
                }
            }
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

        function getBusinessCatalogUserId() {
            try {
                const sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
                if (sessions.business && sessions.business.profile && sessions.business.profile.id) {
                    return String(sessions.business.profile.id);
                }
                const userData = JSON.parse(localStorage.getItem('userData') || 'null');
                if (userData && userData.profile && userData.profile.id) {
                    return String(userData.profile.id);
                }
            } catch {}
            return null;
        }

        async function handleAllInfoImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            try {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('folder', 'works');
                const uid = getBusinessCatalogUserId();
                if (uid) fd.append('user_id', uid);
                const res = await fetch('/api/worker/upload', {
                    method: 'POST',
                    credentials: 'include',
                    body: fd
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.success && json.data && json.data.url) {
                        allInfoUploadedImgUrl = json.data.url;
                        return;
                    }
                }
            } catch {}
            const reader = new FileReader();
            reader.onload = function(e) {
                allInfoUploadedImgUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function closeAllInfoAddModal() {
            document.getElementById('all-info-add-modal').style.display = 'none';
        }

        async function submitNewAllInfoItem() {
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
            const type = currentAllInfoTab === 'info-view-services' ? 'service' :
                currentAllInfoTab === 'info-view-vacancies' ? 'vacancy' : 'product';

            const submitBtn = document.getElementById('all-info-modal-submit-btn');
            if (submitBtn) submitBtn.disabled = true;

            try {
                if (currentEditingAllInfoCard) {
                    currentEditingAllInfoCard.setAttribute('data-title', title.toLowerCase());
                    currentEditingAllInfoCard.querySelector('.item-title').innerText = title;
                    currentEditingAllInfoCard.querySelector('.item-sub').innerText = sub;
                    const currentImg = allInfoUploadedImgUrl || currentEditingAllInfoCard.querySelector('.item-card-img').src;
                    currentEditingAllInfoCard.querySelector('.item-card-img').src = currentImg;
                    currentEditingAllInfoCard.dataset.description = desc;
                    currentEditingAllInfoCard.onclick = () => openAllInfoItemDetails(title, sub, desc, currentImg);
                    syncBusinessListingEdit(currentEditingAllInfoCard, type, title, sub, desc, currentImg);

                    const existingId = currentEditingAllInfoCard.dataset.businessListingId || '';
                    const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId);
                    if (isUuidId) {
                        await fetch('/api/business/catalog', {
                            method: 'PUT',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: existingId,
                                item_type: type,
                                title,
                                subtitle: sub,
                                description: desc,
                                image_url: currentImg
                            })
                        });
                    } else {
                        const res = await fetch('/api/business/catalog', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                user_id: getBusinessCatalogUserId(),
                                item_type: type,
                                title,
                                subtitle: sub,
                                description: desc,
                                image_url: currentImg
                            })
                        });
                        if (res.ok) {
                            const json = await res.json().catch(() => ({}));
                            if (json?.data?.id) {
                                currentEditingAllInfoCard.dataset.businessListingId = json.data.id;
                            }
                        }
                    }
                } else {
                    let createdId = '';
                    const res = await fetch('/api/business/catalog', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: getBusinessCatalogUserId(),
                            item_type: type,
                            title,
                            subtitle: sub,
                            description: desc,
                            image_url: img
                        })
                    });
                    if (res.ok) {
                        const json = await res.json().catch(() => ({}));
                        if (json?.data?.id) createdId = json.data.id;
                    }
                    addBusinessListing(type, title, sub, desc, img, createdId);
                }
            } catch (err) {
                console.error('Could not save business catalog item:', err);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }

            closeAllInfoAddModal();
            filterAllInfoItems();
        }

        window.loadBusinessCatalogFromDatabase = async function () {
            try {
                const catalogUid = getBusinessCatalogUserId();
                if (!catalogUid) return;
                document.querySelectorAll('[data-business-listing-id]').forEach(el => el.remove());
                const res = await fetch('/api/business/catalog?user_id=' + encodeURIComponent(catalogUid), {
                    credentials: 'include',
                    cache: 'no-store'
                });
                if (!res.ok) return;
                const json = await res.json();
                if (!json || !json.success || !Array.isArray(json.data)) return;
                const defaultImg = 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80';
                json.data.forEach(item => {
                    if (!item || !item.id || !item.item_type) return;
                    addBusinessListing(
                        item.item_type,
                        item.title || '',
                        item.subtitle || '',
                        item.description || '',
                        item.image_url || defaultImg,
                        item.id
                    );
                });
            } catch (err) {
                console.warn('Could not load business catalog items:', err);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { void window.loadBusinessCatalogFromDatabase(); });
        } else {
            void window.loadBusinessCatalogFromDatabase();
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
                <div class="profile-info-top-row">
                    <label class="profile-feed-avatar-wrap" title="Upload profile image">
                        <img class="profile-feed-avatar-img" data-feed-avatar-img alt="Profile" />
                        <span class="profile-feed-avatar-badge"><i class="fa-solid fa-camera"></i></span>
                        <input type="file" accept="image/*" hidden onchange="window.handleProfileFeedAvatarUpload(this)" />
                    </label>
                    <div class="profile-info-text-col">
                        <h2 class="profile-name-title" style="font-family: 'Times New Roman', sans-serif; font-size: 1.1rem; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 6px;">
                            NAME <i class="fa-solid fa-circle-check" style="color: #00f0ff; font-size: 0.85rem;"></i>
                        </h2>
                        <div class="profile-handle" style="font-size: 1rem; color: rgba(255, 255, 255, 0.6); margin-top: 2px;">♾️username</div>
                        <div class="profile-about-tag" style="font-size: 1rem; color: #00f0ff; font-weight: 700; margin-top: 6px; text-transform: uppercase;">ABOUT:</div>
                    </div>
                </div>

                
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

                if (type === 'file') {
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
                        preview.innerHTML = `
                    <div style="padding: 10px; background: rgba(0,240,255,0.1); border-radius: 6px; color: #fff;">
                        <i class="fa-solid fa-file-lines" style="color: #00f0ff; margin-right: 6px;"></i>
                        ${file.name} (${(file.size / 1024).toFixed(1)} KB)
                    </div>
                `;
                    });
                } else if (type === 'image') {
                    container.innerHTML = `
            <div class="profile-feed-media-editor">
                <span>${config.prompt}</span>
                <label class="profile-feed-upload">
                    <span>Choose image</span>
                    <input type="file" accept="image/*">
                </label>
                <div class="profile-feed-media-preview"></div>
            </div>
        `;
                    const input = container.querySelector('input[type="file"]');
                    const preview = container.querySelector('.profile-feed-media-preview');
                    input.addEventListener('change', async (e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        preview.innerHTML = '<div style="padding:10px;color:#00f0ff;font-size:0.85rem;">Uploading image...</div>';
                        const mediaUrl = await window.uploadImageToImgBB(file, 'works');
                        if (!mediaUrl) return;
                        preview.innerHTML = `<img src="${mediaUrl}" alt="Post image" style="width:100%; max-height:350px; object-fit:cover; border-radius:8px; margin-top:8px; display:block;">`;
                        const captionText = card.querySelector('.post-text')?.textContent?.trim() || '';
                        await savePostCardToDatabase(card, 'image', captionText, mediaUrl);
                    });
                } else if (type === 'video') {
                    container.innerHTML = `
            <div class="profile-feed-media-editor">
                <div class="profile-feed-media-header-row">
                    <span class="profile-feed-media-title"><i class="fa-solid fa-video"></i><span>Add a video <span class="profile-feed-media-accent">to this post</span></span></span>
                    <button type="button" class="profile-feed-get-pro-btn" onclick="handleGetProClick()"><i class="fa-solid fa-crown"></i> Get Pro</button>
                </div>
                <div class="profile-feed-video-options-row">
                    <label class="profile-feed-upload profile-feed-video-bar">
                        <span class="profile-feed-video-bar-left"><i class="fa-solid fa-video"></i><span>Add <span class="profile-feed-media-accent">30 sec</span> Video Directly</span></span>
                        <i class="fa-solid fa-chevron-right profile-feed-video-bar-chevron"></i>
                        <input type="file" accept="video/*">
                    </label>
                    <button type="button" class="profile-feed-upload profile-feed-video-bar profile-feed-video-url-toggle-btn">
                        <span class="profile-feed-video-bar-left"><i class="fa-solid fa-link"></i><span>Add URL</span></span>
                        <i class="fa-solid fa-chevron-right profile-feed-video-bar-chevron"></i>
                    </button>
                </div>
                <div class="profile-feed-url-row" style="display:none; gap:8px; width:100%; align-items:center; margin-top:6px;">
                    <input type="url" class="profile-feed-url-input" placeholder="Paste video URL (https://...)" style="flex:1; min-width:0; padding:8px 10px; background:#0b0f17; border:1px solid rgba(0,240,255,0.45); border-radius:6px; color:#fff; font-size:0.85rem; outline:none;">
                    <button type="button" class="profile-feed-upload profile-feed-apply-url-btn" style="flex-shrink:0; font-weight:700;">Add URL</button>
                </div>
                <div class="profile-feed-media-preview"></div>
            </div>
        `;
                    const directInput = container.querySelector('input[type="file"]');
                    const urlToggleBtn = container.querySelector('.profile-feed-video-url-toggle-btn');
                    const urlRow = container.querySelector('.profile-feed-url-row');
                    const urlInput = container.querySelector('.profile-feed-url-input');
                    const addBtn = container.querySelector('.profile-feed-apply-url-btn');
                    const preview = container.querySelector('.profile-feed-media-preview');
                    urlToggleBtn.addEventListener('click', () => {
                        urlRow.style.display = 'flex';
                        urlInput.focus();
                    });
                    directInput.addEventListener('change', async (e) => {
                        if (!window.requireInfinityAuthForPost()) return;
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        preview.innerHTML = '<div style="padding:10px;color:#00f0ff;font-size:0.85rem;">Checking video duration (max 30s)...</div>';
                        const check = await window.validateVideoDuration30Sec(file);
                        if (!check.valid) {
                            directInput.value = '';
                            preview.innerHTML = `<div style="padding:10px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(check.error)}</div>`;
                            alert(check.error);
                            return;
                        }
                        preview.innerHTML = '<div style="padding:10px;color:#00f0ff;font-size:0.85rem;">Uploading 30s video...</div>';
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('folder', 'works');
                        const res = await fetch('/api/worker/upload', { method: 'POST', credentials: 'include', body: fd });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok || !json?.success || !json?.data?.url) {
                            const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload videos.' : 'Video upload failed.');
                            directInput.value = '';
                            preview.innerHTML = `<div style="padding:10px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(msg)}</div>`;
                            alert(msg);
                            return;
                        }
                        const mediaUrl = json.data.url;
                        preview.innerHTML = `<video controls playsinline preload="metadata" src="${mediaUrl}" style="width:100%; max-height:350px; border-radius:8px; margin-top:8px; background:#000;"></video>`;
                        const captionText = card.querySelector('.post-text')?.textContent?.trim() || '';
                        await savePostCardToDatabase(card, 'video', captionText, mediaUrl);
                    });
                    const applyUrl = async () => {
                        const mediaUrl = urlInput.value.trim();
                        if (!mediaUrl) return;
                        preview.innerHTML = `<video controls playsinline preload="metadata" referrerpolicy="no-referrer" onclick="if(event.target===this){this.paused?this.play():this.pause()}" onerror="window.handleInfinityMediaError(this, '${mediaUrl.replace(/'/g, "\'")}', 'video')" src="${normalizeExternalMediaUrl(mediaUrl)}" style="width:100%; max-height:350px; border-radius:8px; margin-top:8px; background:#000; cursor:pointer;"></video>`;
                        const captionText = card.querySelector('.post-text')?.textContent?.trim() || '';
                        await savePostCardToDatabase(card, 'video', captionText, mediaUrl);
                    };
                    addBtn.addEventListener('click', applyUrl);
                    urlInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            applyUrl();
                        }
                    });
                } else {
                    const placeholder = `Paste ${type} URL (https://...)`;
                    container.innerHTML = `
            <div class="profile-feed-media-editor">
                <span>${config.prompt}</span>
                <button type="button" class="profile-feed-upload profile-feed-choose-url-btn">Choose ${type}</button>
                <div class="profile-feed-url-row" style="display:none; gap:8px; width:100%; align-items:center; margin-top:6px;">
                    <input type="url" class="profile-feed-url-input" placeholder="${placeholder}" style="flex:1; min-width:0; padding:8px 10px; background:#0b0f17; border:1px solid rgba(0,240,255,0.45); border-radius:6px; color:#fff; font-size:0.85rem; outline:none;">
                    <button type="button" class="profile-feed-upload profile-feed-apply-url-btn" style="flex-shrink:0; font-weight:700;">Add URL</button>
                </div>
                <div class="profile-feed-media-preview"></div>
            </div>
        `;
                    const chooseBtn = container.querySelector('.profile-feed-choose-url-btn');
                    const urlRow = container.querySelector('.profile-feed-url-row');
                    const urlInput = container.querySelector('.profile-feed-url-input');
                    const addBtn = container.querySelector('.profile-feed-apply-url-btn');
                    const preview = container.querySelector('.profile-feed-media-preview');
                    chooseBtn.addEventListener('click', () => {
                        chooseBtn.style.display = 'none';
                        urlRow.style.display = 'flex';
                        urlInput.focus();
                    });
                    const applyUrl = async () => {
                        const mediaUrl = urlInput.value.trim();
                        if (!mediaUrl) return;
                        if (type === 'image') {
                            const nUrl = normalizeExternalMediaUrl(mediaUrl);
                            preview.innerHTML = `<img src="${nUrl}" referrerpolicy="no-referrer" alt="Post image" onerror="window.handleInfinityImageError(this, '${mediaUrl.replace(/'/g, "\\'")}')" style="width:100%; max-height:350px; object-fit:cover; border-radius:8px; margin-top:8px; display:block;">`;
                        } else if (type === 'video') {
                            preview.innerHTML = `<video controls playsinline preload="metadata" referrerpolicy="no-referrer" onclick="if(event.target===this){this.paused?this.play():this.pause()}" onerror="window.handleInfinityMediaError(this, \'${mediaUrl.replace(/\'/g, "\\\'")}\', \'video\')" src="${normalizeExternalMediaUrl(mediaUrl)}" style="width:100%; max-height:350px; border-radius:8px; margin-top:8px; background:#000; cursor:pointer;"></video>`;
                        } else if (type === 'audio') {
                            preview.innerHTML = `<audio controls src="${mediaUrl}" style="width:100%; margin-top:8px;"></audio>`;
                        }
                        const captionText = card.querySelector('.post-text')?.textContent?.trim() || '';
                        await savePostCardToDatabase(card, type, captionText, mediaUrl);
                    };
                    addBtn.addEventListener('click', applyUrl);
                    urlInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            applyUrl();
                        }
                    });
                }
            });
        }

        // Initialize after the legacy markup has been mounted. In Next.js this
        // script is injected after hydration, so DOMContentLoaded may have fired.
        function initializeInfinityFeedMediaUploaders() {
            initFeedMediaUploaders('#userFeed');
            initFeedMediaUploaders('#socialFeed');
            const msgFeed = document.getElementById('messageFloaterFeed');
            if (msgFeed && !msgFeed.dataset.uploadersInitialized) {
                initFeedMediaUploaders('#messageFloaterFeed');
                msgFeed.dataset.uploadersInitialized = 'true';
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeInfinityFeedMediaUploaders, { once: true });
        } else {
            initializeInfinityFeedMediaUploaders();
        }

        function revealCompanyMediaUrlInput(btn) {
            const editor = btn.closest('.profile-feed-media-editor');
            if (!editor) return;
            btn.style.display = 'none';
            const row = editor.querySelector('.profile-feed-url-row');
            if (row) {
                row.style.display = 'flex';
                row.querySelector('.profile-feed-url-input')?.focus();
            }
        }

        function revealCompanyVideoOptions(btn) {
            const editor = btn.closest('.profile-feed-media-editor');
            if (!editor) return;
            btn.style.display = 'none';
            const optionsRow = editor.querySelector('.profile-feed-video-options-row');
            if (optionsRow) optionsRow.style.display = 'flex';
        }

        function revealCompanyVideoUrlInput(btn) {
            const editor = btn.closest('.profile-feed-media-editor');
            if (!editor) return;
            const row = editor.querySelector('.profile-feed-url-row');
            if (row) {
                row.style.display = 'flex';
                row.querySelector('.profile-feed-url-input')?.focus();
            }
        }

        async function handleCompanyVideoUpload(input) {
            if (!window.requireInfinityAuthForPost()) return;
            const file = input?.files && input.files[0];
            if (!file) return;
            const card = input.closest('.social-post-card');
            const previewContainer = card?.querySelector('.profile-feed-media-preview');
            const editorBox = card?.querySelector('.profile-feed-media-editor');
            if (!previewContainer) return;

            previewContainer.innerHTML = '<div style="padding:12px;color:#00f0ff;font-size:0.85rem;">Checking video duration (max 30s)...</div>';
            const check = await window.validateVideoDuration30Sec(file);
            if (!check.valid) {
                input.value = '';
                previewContainer.innerHTML = `<div style="padding:12px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(check.error)}</div>`;
                alert(check.error);
                return;
            }

            if (editorBox) editorBox.style.display = 'none';
            previewContainer.innerHTML = '<div style="padding:12px;color:#00f0ff;font-size:0.85rem;">Uploading 30s video...</div>';

            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', 'works');
            const res = await fetch('/api/worker/upload', { method: 'POST', credentials: 'include', body: fd });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success || !json?.data?.url) {
                const msg = json?.error?.message || (res.status === 401 ? 'Please sign in to upload videos.' : 'Video upload failed.');
                input.value = '';
                if (editorBox) editorBox.style.display = 'flex';
                previewContainer.innerHTML = `<div style="padding:12px;color:#ff6b6b;font-size:0.85rem;">${escapeHtml(msg)}</div>`;
                alert(msg);
                return;
            }

            const mediaUrl = json.data.url;
            previewContainer.innerHTML = `<video src="${mediaUrl}" controls playsinline style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1); background:#000;"></video>`;
            const captionText = card?.querySelector('.post-text')?.textContent?.trim() || '';
            void savePostCardToDatabase(card, 'video', captionText, mediaUrl);
        }

        async function handleCompanyImageUpload(input) {
            if (!window.requireInfinityAuthForPost()) return;
            const file = input?.files && input.files[0];
            if (!file) return;
            const card = input.closest('.social-post-card');
            const previewContainer = card?.querySelector('.profile-feed-media-preview');
            const editorBox = card?.querySelector('.profile-feed-media-editor');
            if (!previewContainer) return;

            if (editorBox) editorBox.style.display = 'none';
            previewContainer.innerHTML = '<div style="padding:12px;color:#00f0ff;font-size:0.85rem;">Uploading image...</div>';

            const mediaUrl = await window.uploadImageToImgBB(file, 'works');
            if (!mediaUrl) return;
            previewContainer.innerHTML = `<img src="${mediaUrl}" alt="${escapeHtml(file.name || 'Post image')}" style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">`;
            const captionText = card?.querySelector('.post-text')?.textContent?.trim() || '';
            void savePostCardToDatabase(card, 'image', captionText, mediaUrl);
        }

        function handleCompanyMediaUrl(triggerBtn, type) {
            if (!window.requireInfinityAuthForPost()) return;
            const card = triggerBtn.closest('.social-post-card');
            const previewContainer = card.querySelector('.profile-feed-media-preview');
            const editorBox = card.querySelector('.profile-feed-media-editor');
            const urlInput = editorBox ? editorBox.querySelector('.profile-feed-url-input') : null;
            const mediaUrl = urlInput ? urlInput.value.trim() : '';
            if (!mediaUrl || !previewContainer) return;

            if (editorBox) editorBox.style.display = 'none';
            previewContainer.innerHTML = '';

            if (type === 'image') {
                previewContainer.innerHTML = `<img src="${mediaUrl}" alt="Post image" style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);">`;
            } else if (type === 'video') {
                previewContainer.innerHTML = `<video src="${mediaUrl}" controls playsinline style="width: 100%; max-height: 350px; object-fit: cover; border: 1px solid rgba(255,255,255,0.1);"></video>`;
            } else if (type === 'audio') {
                previewContainer.innerHTML = `<audio src="${mediaUrl}" controls style="width: 100%; margin-top: 5px;"></audio>`;
            }
            const captionText = card?.querySelector('.post-text')?.textContent?.trim() || '';
            void savePostCardToDatabase(card, type, captionText, mediaUrl);
        }

        function handleCompanyMediaUpload(input, type) {
            if (!window.requireInfinityAuthForPost()) return;
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

/* === INFINITY AUTH PROFILE HEADER SYNC === */
(function initInfinityAuthProfile() {
    let activeAuthUser = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatHandle(username) {
        if (!username) return '♾️user';
        const cleaned = String(username).trim().replace(/^(?:♾️|♾|∞|@)+/u, '');
        return cleaned ? '♾️' + cleaned : '♾️user';
    }

    function getInitial(profile, user) {
        const source = (profile && profile.display_name)
            || (profile && String(profile.username || '').replace(/^(?:♾️|♾|∞|@)+/u, ''))
            || (user && user.email)
            || 'I';
        return String(source).trim().charAt(0).toUpperCase() || 'I';
    }

    function applyLoggedOutState() {
        activeAuthUser = null;
        try { localStorage.removeItem('myNetworks'); } catch {}
        if (typeof window.resetBuildNetworkSessionState === 'function') {
            window.resetBuildNetworkSessionState();
        }
        document.querySelectorAll('.header-profile-trigger').forEach(trigger => {
            trigger.removeAttribute('data-authenticated');
            trigger.removeAttribute('title');
            trigger.innerHTML = '<i class="fa-solid fa-user matrix-icon"></i>';
        });

        const overlay = document.getElementById('userMenuOverlay');
        if (overlay && overlay.dataset.authMode === 'logged-in') {
            delete overlay.dataset.authMode;
            overlay.innerHTML = `
                <div style="display: flex; justify-content: flex-end; padding: 10px;">
                    <button onclick="closeUserMenuOverlay()" style="background: transparent; border: none; color: #fff; font-size: 1.5rem; cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="glow-container btn-container" style="flex: 1; min-height: 80px;" onclick="selectUserMenuOption('User Login')">
                    <button class="menu-btn">LOGIN AS A USER</button>
                </div>
                <div class="glow-container btn-container" style="flex: 1; min-height: 80px;" onclick="selectUserMenuOption('Register Work')">
                    <button class="menu-btn">REGISTER YOUR WORK</button>
                </div>
                <div class="glow-container btn-container" style="flex: 1; min-height: 80px;" onclick="selectUserMenuOption('Register Business')">
                    <button class="menu-btn">REGISTER YOUR BUSINESS</button>
                </div>
            `;
        }
    }

    function getAccountSessions() {
        try {
            return JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
        } catch {
            return {};
        }
    }

    function saveAccountSessions(sessions) {
        try {
            localStorage.setItem('infinityAccountSessions', JSON.stringify(sessions));
        } catch {}
    }

    function getAccountStack() {
        try {
            const arr = JSON.parse(localStorage.getItem('infinityAccountStack') || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function saveAccountStack(stack) {
        try {
            localStorage.setItem('infinityAccountStack', JSON.stringify(stack));
        } catch {}
    }

    function recordAccountSession(authData) {
        const type = authData?.profile?.account_type || 'personal';
        const sessions = getAccountSessions();
        sessions[type] = authData;
        saveAccountSessions(sessions);

        const stack = getAccountStack().filter(t => t !== type);
        stack.push(type);
        saveAccountStack(stack);
        try {
            localStorage.setItem('infinityActiveAccountType', type);
        } catch {}
    }

    function applyLoggedInState(data) {
        if (!data || !data.profile) return;
        const prevId = activeAuthUser?.profile?.id || null;
        const prevType = activeAuthUser?.profile?.account_type || null;
        activeAuthUser = data;
        if (prevId !== data.profile.id || prevType !== data.profile.account_type) {
            if (typeof window.onAccountSwitchedForNetwork === 'function') {
                window.onAccountSwitchedForNetwork();
            }
            if (typeof window.syncTargetSupportsFromDatabase === 'function') {
                window.syncTargetSupportsFromDatabase();
            }
        }
        recordAccountSession(data);

        const profile = data.profile;
        const user = data.user || {};
        const displayName = profile.display_name || formatHandle(profile.username);
        const handle = formatHandle(profile.username);
        const initial = getInitial(profile, user);
        const accountLabel = profile.account_type === 'creator'
            ? 'Work'
            : profile.account_type === 'business'
                ? 'Business'
                : 'User';

        // Replace the generic cyan user silhouette icon with the logged-in user's profile badge/avatar
        document.querySelectorAll('.header-profile-trigger').forEach(trigger => {
            trigger.setAttribute('data-authenticated', 'true');
            trigger.setAttribute('title', `${displayName} (${handle})`);
            if (profile.avatar_url) {
                trigger.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(displayName)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block;" />`;
            } else {
                trigger.innerHTML = `<span style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.95rem; letter-spacing: 0.02em; color: #05070f; background: linear-gradient(135deg, #39e8f4, #7c5cff); border-radius: inherit;">${escapeHtml(initial)}</span>`;
            }
        });

        // Update #userFeedSection header if present
        const userFeed = document.getElementById('userFeedSection');
        if (userFeed) {
            const isBusinessAccount = profile.account_type === 'business';
            if (!isBusinessAccount) {
                const nameTitle = userFeed.querySelector('.profile-name-title');
                if (nameTitle && nameTitle.firstChild) {
                    nameTitle.firstChild.nodeValue = displayName + ' ';
                }
            }
            const handleEl = userFeed.querySelector('.profile-handle');
            if (handleEl) {
                handleEl.textContent = handle;
            }
            if (isBusinessAccount && typeof window.syncBusinessFeedHeader === 'function') {
                window.syncBusinessFeedHeader();
            }
            if (typeof window.applyProfileContactToDom === 'function') {
                window.applyProfileContactToDom(profile, ['userFeedSection']);
            }
            const feedAvatarImg = userFeed.querySelector('[data-feed-avatar-img]');
            if (feedAvatarImg) {
                if (profile.avatar_url) {
                    feedAvatarImg.src = profile.avatar_url;
                    feedAvatarImg.style.display = 'block';
                } else {
                    feedAvatarImg.removeAttribute('src');
                    feedAvatarImg.style.display = 'none';
                }
            }
        }
        if (typeof window.populatePostAuthorSelector === 'function') {
            window.populatePostAuthorSelector();
        }

        // Update #userMenuOverlay to show logged-in profile actions instead of login/register buttons
        const overlay = document.getElementById('userMenuOverlay');
        if (overlay) {
            overlay.dataset.authMode = 'logged-in';
            overlay.innerHTML = `
                <div style="display: flex; justify-content: flex-end; padding: 10px;">
                    <button onclick="closeUserMenuOverlay()" style="background: transparent; border: none; color: #fff; font-size: 1.5rem; cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div style="max-width: 460px; width: 100%; margin: 12px auto; padding: 24px; border-radius: 16px; background: rgba(12, 18, 34, 0.95); border: 1px solid rgba(57, 232, 244, 0.35); color: #fff; display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        ${
                            profile.avatar_url
                                ? `<img src="${escapeHtml(profile.avatar_url)}" alt="${escapeHtml(displayName)}" style="width: 56px; height: 56px; border-radius: 14px; object-fit: cover; border: 2px solid #39e8f4;" />`
                                : `<div style="width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.4rem; color: #05070f; background: linear-gradient(135deg, #39e8f4, #7c5cff);">${escapeHtml(initial)}</div>`
                        }
                        <div style="min-width: 0;">
                            <div style="font-size: 1.15rem; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayName)}</div>
                            <div style="font-size: 0.92rem; color: #39e8f4; font-weight: 600;">${escapeHtml(handle)}</div>
                            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">${escapeHtml(accountLabel)} Account${user.email ? ' · ' + escapeHtml(user.email) : ''}</div>
                        </div>
                    </div>
                    <button type="button" onclick="openMyProfileFromMenu()" style="width: 100%; padding: 13px 16px; border-radius: 10px; border: 1px solid rgba(57, 232, 244, 0.5); background: rgba(57, 232, 244, 0.12); color: #39e8f4; font-weight: 700; font-size: 0.95rem; cursor: pointer;">
                        View My Profile
                    </button>
                    <button type="button" onclick="logoutInfinityUser()" style="width: 100%; padding: 13px 16px; border-radius: 10px; border: 1px solid rgba(244, 63, 94, 0.45); background: rgba(244, 63, 94, 0.12); color: #fda4af; font-weight: 700; font-size: 0.95rem; cursor: pointer;">
                        Sign Out
                    </button>
                </div>
            `;
        }
    }

    function detectAccountTypeForElement(el, forcedType) {
        if (forcedType) return forcedType;
        if (el.closest('#visitorFeedPage')) return 'personal';
        if (el.closest('#userProfilePage')) return 'business';
        return activeAuthUser?.profile?.account_type || 'personal';
    }

    function openTargetAccountPage(targetType) {
        const wp = document.getElementById('workerProfileOverlay');
        const vf = document.getElementById('visitorFeedPage');
        const up = document.getElementById('userProfilePage');
        const sm = document.getElementById('socialMediaPage');
        const mm = document.getElementById('marketMatrixPage');

        if (targetType !== 'creator' && wp) wp.style.display = 'none';
        if (targetType !== 'personal' && vf) vf.style.display = 'none';
        if (targetType !== 'business' && up) up.style.display = 'none';
        if (mm) mm.style.display = 'none';

        if (targetType === 'creator') {
            if (typeof openWorkerProfilePage === 'function') openWorkerProfilePage();
        } else if (targetType === 'business') {
            if (sm) sm.style.display = 'flex';
            if (typeof toggleUserPage === 'function') {
                activeView = 'home';
                toggleUserPage();
                if (typeof window.syncBusinessFeedHeader === 'function') {
                    window.syncBusinessFeedHeader();
                }
            } else if (up) {
                up.style.display = 'block';
            }
        } else {
            if (typeof openVisitorFeedPage === 'function') openVisitorFeedPage();
        }
    }

    window.closeAccountSwitcherRow = function (btnEl) {
        const grid = btnEl?.closest('.profile-stats-grid');
        if (!grid || !grid.dataset.originalStatsHtml) return;
        grid.innerHTML = grid.dataset.originalStatsHtml;
        delete grid.dataset.originalStatsHtml;
    };

    window.handleAccountSwitchOrSignIn = function (targetType, btnEl) {
        if (btnEl) window.closeAccountSwitcherRow(btnEl);
        const sessions = getAccountSessions();
        if (sessions[targetType] && sessions[targetType].profile) {
            try {
                localStorage.setItem('userData', JSON.stringify(sessions[targetType]));
                localStorage.setItem('infinityActiveAccountType', targetType);
            } catch {}
            applyLoggedInState(sessions[targetType]);
            openTargetAccountPage(targetType);
            return;
        }
        window.location.href = `/login?type=${encodeURIComponent(targetType)}&register=true`;
    };

    window.handleAccountSignOutFromRow = async function (currentType, btnEl) {
        if (btnEl) window.closeAccountSwitcherRow(btnEl);
        const sessions = getAccountSessions();
        delete sessions[currentType];
        saveAccountSessions(sessions);

        const stack = getAccountStack().filter(t => t !== currentType);
        saveAccountStack(stack);

        const prevType = stack[stack.length - 1];
        if (prevType && sessions[prevType] && sessions[prevType].profile) {
            try {
                localStorage.setItem('userData', JSON.stringify(sessions[prevType]));
                localStorage.setItem('infinityActiveAccountType', prevType);
            } catch {}
            applyLoggedInState(sessions[prevType]);
            openTargetAccountPage(prevType);
            return;
        }

        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch {}
        try {
            localStorage.removeItem('userData');
            localStorage.removeItem('infinityAccountSessions');
            localStorage.removeItem('infinityAccountStack');
            localStorage.removeItem('infinityActiveAccountType');
            localStorage.removeItem('infinityActivePageView');
            localStorage.removeItem('myNetworks');
        } catch {}
        applyLoggedOutState();
        window.location.href = `/login?type=${encodeURIComponent(currentType || 'personal')}&register=true`;
    };

    window.applyLoggedInState = applyLoggedInState;
    window.applyLoggedOutState = applyLoggedOutState;

    window.openAccountSwitcherRow = function (triggerEl, forcedType) {
        const grid = triggerEl?.closest('.profile-stats-grid');
        if (!grid) return;
        const doc = grid.ownerDocument || document;
        const currentType = detectAccountTypeForElement(grid, forcedType);

        if (!grid.dataset.originalStatsHtml) {
            grid.dataset.originalStatsHtml = grid.innerHTML;
        }

        const otherOptions = currentType === 'business'
            ? [
                { type: 'personal', label: 'User', icon: 'fa-solid fa-user' },
                { type: 'creator', label: 'Work', icon: 'fa-solid fa-briefcase' }
            ]
            : currentType === 'creator'
                ? [
                    { type: 'personal', label: 'User', icon: 'fa-solid fa-user' },
                    { type: 'business', label: 'Business', icon: 'fa-solid fa-building' }
                ]
                : [
                    { type: 'business', label: 'Business', icon: 'fa-solid fa-building' },
                    { type: 'creator', label: 'Work', icon: 'fa-solid fa-briefcase' }
                ];

        const parentPrefix = doc !== document ? 'window.parent.' : '';
        const btnStyle = 'background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.35); border-radius:10px; padding:8px 4px; color:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700; text-transform:uppercase;';
        const signOutStyle = 'background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.45); border-radius:10px; padding:8px 4px; color:#fda4af; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700; text-transform:uppercase;';
        const closeStyle = 'background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.25); border-radius:10px; padding:8px 4px; color:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700;';

        grid.innerHTML = `
            <button type="button" onclick="${parentPrefix}handleAccountSignOutFromRow('${currentType}', this)" style="${signOutStyle}" title="Sign Out">
                <i class="fa-solid fa-right-from-bracket" style="font-size:1rem;"></i>
                <span>Sign Out</span>
            </button>
            <button type="button" onclick="${parentPrefix}handleAccountSwitchOrSignIn('${otherOptions[0].type}', this)" style="${btnStyle}" title="Sign in as ${otherOptions[0].label}">
                <i class="${otherOptions[0].icon}" style="font-size:1rem; color:#00f0ff;"></i>
                <span>${otherOptions[0].label}</span>
            </button>
            <button type="button" onclick="${parentPrefix}handleAccountSwitchOrSignIn('${otherOptions[1].type}', this)" style="${btnStyle}" title="Sign in as ${otherOptions[1].label}">
                <i class="${otherOptions[1].icon}" style="font-size:1rem; color:#00f0ff;"></i>
                <span>${otherOptions[1].label}</span>
            </button>
            <button type="button" onclick="${parentPrefix}closeAccountSwitcherRow(this)" style="${closeStyle}" aria-label="Close" title="Close">
                <i class="fa-solid fa-xmark" style="font-size:1.05rem;"></i>
            </button>
        `;
    };

    window.openMyProfileFromMenu = function () {
        if (typeof closeUserMenuOverlay === 'function') closeUserMenuOverlay();
        const accountType = activeAuthUser?.profile?.account_type
            || (() => {
                try {
                    return JSON.parse(localStorage.getItem('userData') || '{}')?.profile?.account_type;
                } catch {
                    return 'personal';
                }
            })()
            || 'personal';

        if (accountType === 'creator') {
            if (typeof openWorkerProfilePage === 'function') {
                openWorkerProfilePage();
            }
            return;
        }

        if (accountType === 'business') {
            if (typeof toggleUserPage === 'function') {
                if (typeof activeView !== 'undefined' && activeView === 'user') {
                    activeView = 'home';
                }
                toggleUserPage();
            }
            return;
        }

        if (typeof openVisitorFeedPage === 'function') {
            openVisitorFeedPage();
        }
    };

    window.logoutInfinityUser = async function () {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch (err) {
            console.warn('Logout request failed:', err);
        }
        try {
            localStorage.removeItem('userData');
            localStorage.removeItem('infinityAccountSessions');
            localStorage.removeItem('infinityAccountStack');
            localStorage.removeItem('infinityActiveAccountType');
            localStorage.removeItem('infinityActivePageView');
            localStorage.removeItem('myNetworks');
        } catch {}
        applyLoggedOutState();
        if (typeof closeUserMenuOverlay === 'function') closeUserMenuOverlay();
        window.location.reload();
    };

    async function syncAuthProfile() {
        let cachedUser = null;
        try {
            const activeType = localStorage.getItem('infinityActiveAccountType');
            const sessions = getAccountSessions();
            if (activeType && sessions[activeType] && sessions[activeType].profile) {
                cachedUser = sessions[activeType];
                localStorage.setItem('userData', JSON.stringify(cachedUser));
            } else {
                const cached = localStorage.getItem('userData');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed && parsed.profile) cachedUser = parsed;
                }
            }
            if (cachedUser && cachedUser.profile) {
                applyLoggedInState(cachedUser);
            }
        } catch {}

        let isFreshLogin = false;
        try {
            const params = new URLSearchParams(window.location.search);
            isFreshLogin = params.get('openProfile') === '1';
        } catch {}

        const restoreSavedAccountPage = () => {
            try {
                const savedView = localStorage.getItem('infinityActivePageView');
                if (savedView === 'personal' || savedView === 'creator' || savedView === 'business') {
                    openTargetAccountPage(savedView);
                } else if (savedView === 'company') {
                    try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
                }
            } catch {}
        };

        try {
            const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                if (json && json.success && json.data && json.data.profile) {
                    const serverType = json.data.profile.account_type || 'personal';
                    const sameAccount = Boolean(
                        cachedUser &&
                        cachedUser.profile &&
                        cachedUser.profile.id === json.data.profile.id &&
                        (cachedUser.profile.account_type || 'personal') === serverType
                    );

                    if (isFreshLogin || !cachedUser || !cachedUser.profile || sameAccount) {
                        try {
                            localStorage.setItem('userData', JSON.stringify(json.data));
                            localStorage.setItem('infinityActiveAccountType', serverType);
                        } catch {}
                        applyLoggedInState(json.data);
                    } else {
                        const sessions = getAccountSessions();
                        if (sessions[serverType]) {
                            sessions[serverType] = json.data;
                            saveAccountSessions(sessions);
                        }
                    }

                    if (isFreshLogin) {
                        try {
                            const params = new URLSearchParams(window.location.search);
                            params.delete('openProfile');
                            const cleanQuery = params.toString();
                            const cleanUrl = window.location.pathname + (cleanQuery ? '?' + cleanQuery : '') + window.location.hash;
                            window.history.replaceState(window.history.state || {}, '', cleanUrl);
                        } catch {}
                        if (typeof window.openMyProfileFromMenu === 'function') {
                            window.openMyProfileFromMenu();
                        }
                    } else {
                        try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
                    }
                    return;
                }
            }
            if (res.status === 401) {
                try {
                    localStorage.removeItem('userData');
                    localStorage.removeItem('infinityActiveAccountType');
                    localStorage.removeItem('infinityActivePageView');
                } catch {}
                applyLoggedOutState();
            }
        } catch (err) {
            console.warn('Could not sync auth profile:', err);
            try { localStorage.setItem('infinityActivePageView', 'home'); } catch {}
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncAuthProfile);
    } else {
        syncAuthProfile();
    }
})();

/* === INFINITY DATABASE POSTS SYNC === */
(function initInfinityDatabasePosts() {
    function escapeHtmlSafe(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildDbMediaHtml(post) {
        if (!post.media_url) return '';
        const normalized = normalizeExternalMediaUrl(post.media_url);
        const url = escapeHtmlSafe(normalized);
        const rawEscaped = escapeHtmlSafe(post.media_url);
        if (post.type === 'video') {
            const embedUrl = getVideoEmbedUrl(post.media_url);
            if (embedUrl) {
                return `<div class="post-media-container"><iframe src="${escapeHtmlSafe(embedUrl)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="width:100%; aspect-ratio:16/9; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:#000;"></iframe></div>`;
            }
            return `<div class="post-media-container"><video controls playsinline preload="metadata" referrerpolicy="no-referrer" onclick="if(event.target===this){this.paused?this.play():this.pause()}" onerror="window.handleInfinityMediaError(this, '${rawEscaped}', 'video')" src="${url}" style="width:100%; max-height:350px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#000; cursor:pointer;"></video></div>`;
        }
        if (post.type === 'audio') {
            return `<div class="post-media-container"><audio controls preload="metadata" referrerpolicy="no-referrer" onerror="window.handleInfinityMediaError(this, '${rawEscaped}', 'audio')" src="${url}" style="width:100%; margin-top:5px;"></audio></div>`;
        }
        return `<div class="post-media-container"><img src="${url}" referrerpolicy="no-referrer" alt="Post media" onerror="window.handleInfinityImageError(this, '${rawEscaped}')" style="width:100%; max-height:350px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.1); display:block;"></div>`;
    }

    function buildDbPostCard(post) {
        const card = document.createElement('div');
        card.className = 'social-post-card';
        card.dataset.type = post.type || 'text';
        card.dataset.postId = post.id;
        card.dataset.dbSynced = 'true';
        if (post.created_at) card.dataset.createdAt = String(post.created_at);

        const authorName = post.author?.display_name || post.author?.username || 'User';
        const rawHandle = post.author?.username || '';
        if (post.author?.id || post.user_id) card.dataset.authorId = String(post.author?.id || post.user_id);
        if (rawHandle) card.dataset.authorUsername = String(rawHandle).replace(/^(?:♾️|♾|∞|@)+/u, '').trim().toLowerCase();
        card.dataset.authorAccountType = String(post.author?.account_type || 'personal').toLowerCase();
        if (post.author?.avatar_url) card.dataset.authorAvatar = String(post.author.avatar_url);
        if (post.author?.contact_phone) card.dataset.authorPhone = String(post.author.contact_phone);
        if (post.author?.contact_email) card.dataset.authorEmail = String(post.author.contact_email);
        if (post.author?.contact_location) card.dataset.authorLocation = String(post.author.contact_location);
        const handle = rawHandle ? (rawHandle.startsWith('♾️') ? rawHandle : '♾️' + rawHandle.replace(/^(?:♾️|♾|∞|@)+/u, '')) : '';
        const initial = String(authorName).replace(/^(?:♾️|♾|∞|@)+/u, '').trim().charAt(0).toUpperCase() || 'U';
        const dateLabel = post.created_at ? new Date(post.created_at).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';

        const likedClass = post.user_has_liked ? ' liked' : '';
        const heartIcon = post.user_has_liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
        const repostedClass = post.user_has_reposted ? ' reposted' : '';
        const bookmarkedClass = post.user_has_bookmarked ? ' bookmarked' : '';
        const bookmarkIcon = post.user_has_bookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';

        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar" style="overflow:hidden;">${post.author?.avatar_url ? `<img src="${escapeHtmlSafe(post.author.avatar_url)}" alt="${escapeHtmlSafe(authorName)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />` : escapeHtmlSafe(initial)}</div>
                <div class="post-author-info">
                    <h4>${escapeHtmlSafe(authorName)} ${handle ? `<span style="font-size:0.72rem; color:#39e8f4;">${escapeHtmlSafe(handle)}</span>` : ''}</h4>
                    <span>${escapeHtmlSafe(dateLabel)}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-text">${sanitizeRichPostHtml(post.content)}</div>` : ''}
            ${buildDbMediaHtml(post)}
            ${post.reposted_post ? (() => {
                const rp = post.reposted_post;
                const rpAuthor = rp.author?.display_name || rp.author?.username || 'User';
                const rpHandle = rp.author?.username ? ('@' + String(rp.author.username).replace(/^@+/, '')) : '';
                const rpInitial = String(rpAuthor).charAt(0).toUpperCase() || 'U';
                return `<div class="reposted-subpost-card" style="border:1px solid rgba(57,232,244,0.28); border-radius:10px; padding:10px; margin-top:8px; background:#0d1117;">
                    <div class="post-header" style="margin-bottom:6px;">
                        <div class="post-avatar" style="width:32px;height:32px;font-size:0.8rem;overflow:hidden;">${rp.author?.avatar_url ? `<img src="${escapeHtmlSafe(rp.author.avatar_url)}" alt="${escapeHtmlSafe(rpAuthor)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />` : escapeHtmlSafe(rpInitial)}</div>
                        <div class="post-author-info">
                            <h4 style="font-size:0.9rem;">${escapeHtmlSafe(rpAuthor)} ${rpHandle ? `<span style="font-size:0.7rem;color:#39e8f4;">${escapeHtmlSafe(rpHandle)}</span>` : ''}</h4>
                        </div>
                    </div>
                    ${rp.content ? `<div class="post-text" style="font-size:0.9rem;">${sanitizeRichPostHtml(rp.content)}</div>` : ''}
                    ${buildDbMediaHtml(rp)}
                </div>`;
            })() : ''}
            <div class="post-actions">
                <div class="action-group-left">
                    <button class="action-btn${likedClass}" onclick="toggleLike(this)"><i class="${heartIcon}"></i><span class="action-count">${Number(post.like_count || 0)}</span></button>
                    <button class="action-btn" onclick="openPostComments(this.closest('.social-post-card'), this)"><i class="fa-regular fa-comment"></i><span class="action-count">${Number(post.comment_count || 0)}</span></button>
                    <button class="action-btn${repostedClass}" onclick="toggleRepost(this)"><i class="fa-solid fa-retweet"></i><span class="action-count">${Number(post.repost_count || 0)}</span></button>
                </div>
                <div class="action-group-right">
                    <button class="action-btn" onclick="handlePostContactAction('phone', this)" title="Phone"><i class="fa-solid fa-phone"></i></button>
                    <button class="action-btn" onclick="handlePostContactAction('email', this)" title="Mail"><i class="fa-solid fa-envelope"></i></button>
                    <button class="action-btn" onclick="handlePostContactAction('location', this)" title="Location"><i class="fa-solid fa-location-dot"></i></button>
                    <button class="action-btn" onclick="handlePostContactAction('whatsapp', this)" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                    <button class="action-btn" onclick="openShareModal(this)" title="Share"><i class="fa-regular fa-paper-plane"></i></button>
                    <button class="action-btn" onclick="downloadPostMedia(this)" title="Download"><i class="fa-solid fa-download"></i></button>
                </div>
            </div>
        `;
        return card;
    }

    window.buildDbPostCard = buildDbPostCard;
    window.renderDbFeedInto = renderDbFeedInto;
    async function renderDbFeedInto(feedId, feedType) {
        const feedEl = document.getElementById(feedId);
        if (!feedEl) return;
        try {
            const res = await fetch(`/api/posts/feed?feed_type=${encodeURIComponent(feedType)}&limit=30`, {
                credentials: 'include',
                cache: 'no-store'
            });
            if (!res.ok) {
                if (res.status === 401) {
                    feedEl.querySelectorAll('.social-post-card[data-db-synced="true"]').forEach(el => el.remove());
                }
                return;
            }
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return;

            feedEl.querySelectorAll('.social-post-card[data-db-synced="true"]').forEach(el => el.remove());
            const fragment = document.createDocumentFragment();
            json.data.forEach(post => {
                fragment.appendChild(buildDbPostCard(post));
            });
            feedEl.prepend(fragment);
            if (feedId === 'userFeed' && typeof window.syncBusinessFeedHeader === 'function') {
                window.syncBusinessFeedHeader();
            }
        } catch (err) {
            console.warn('Could not load database posts:', err);
        }
    }

    window.refreshInfinityDatabaseFeeds = async function () {
        await Promise.all([
            renderDbFeedInto('socialFeed', 'home'),
            renderDbFeedInto('visitorFeed', 'mine'),
            renderDbFeedInto('userFeed', 'mine')
        ]);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { void window.refreshInfinityDatabaseFeeds(); });
    } else {
        void window.refreshInfinityDatabaseFeeds();
    }
})();

/* === INFINITY BUSINESS PROFILE EDITOR & DATABASE SYNC === */
(function initInfinityBusinessEditor() {
    let activeBusinessEditSection = null;
    let activeStaffCard = null;
    let businessProfileLoaded = false;

    function esc(v) {
        return String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function inputStyle() {
        return 'width:100%; padding:10px 12px; background:#20222b; border:1px solid #323544; border-radius:8px; color:#fff; font-size:0.9rem; outline:none; box-sizing:border-box;';
    }

    function labelStyle() {
        return 'display:block; font-size:0.82rem; font-weight:600; color:#9aa0b4; margin-bottom:6px;';
    }

    function trashBtnStyle() {
        return 'width:38px; height:38px; border-radius:8px; border:1px solid #5c242c; background:#2c181d; color:#f87171; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;';
    }

    function dashedAddBtnStyle() {
        return 'width:100%; padding:10px 12px; border-radius:8px; border:1px dashed #2e4b78; background:#141e2e; color:#4da6ff; font-weight:700; font-size:0.88rem; cursor:pointer; text-align:center;';
    }

    function showModalError(msg) {
        const el = document.getElementById('businessEditModalStatus');
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
        } else {
            el.style.display = 'block';
            el.textContent = msg;
        }
    }

    function readListingsFromDom() {
        const container = document.getElementById('listings-display');
        if (!container) return [];
        return Array.from(container.querySelectorAll('a.business-link-box')).map(a => {
            const iconEl = a.querySelector('i');
            const bgClass = Array.from(a.classList).find(c => c.startsWith('business-bg-')) || 'business-bg-web';
            return {
                name: a.textContent.trim(),
                url: a.getAttribute('href') || '#',
                bgClass,
                iconClass: iconEl ? iconEl.className : 'fa-solid fa-bag-shopping'
            };
        });
    }

    function renderListings(items) {
        const container = document.getElementById('listings-display');
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<span style="color:#8888a0; font-size:0.85rem;">No listings added yet.</span>';
            return;
        }
        container.innerHTML = items.map(item => {
            const nameLower = String(item.name || '').toLowerCase();
            let bgClass = item.bgClass || 'business-bg-web';
            let iconClass = item.iconClass || 'fa-solid fa-bag-shopping';
            if (nameLower.includes('swiggy')) { bgClass = 'business-bg-swiggy'; iconClass = 'fa-solid fa-bag-shopping'; }
            else if (nameLower.includes('zomato')) { bgClass = 'business-bg-zomato'; iconClass = 'fa-solid fa-burger'; }
            return `<a href="${esc(item.url || '#')}" target="_blank" rel="noopener noreferrer" class="business-link-box ${esc(bgClass)}"><i class="${esc(iconClass)}"></i> ${esc(item.name)}</a>`;
        }).join('');
    }

    function readDeliveryFromDom() {
        const container = document.getElementById('delivery-display');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.business-delivery-tag'))
            .map(el => el.textContent.trim())
            .filter(Boolean);
    }

    function renderDelivery(places) {
        const container = document.getElementById('delivery-display');
        if (!container) return;
        if (!places.length) {
            container.innerHTML = '<span style="color:#8888a0; font-size:0.85rem;">No delivery places added.</span>';
            return;
        }
        container.innerHTML = places.map(p =>
            `<span class="business-delivery-tag"><i class="fa-solid fa-location-dot"></i> ${esc(p)}</span>`
        ).join('');
    }

    function readSocialFromDom() {
        const container = document.getElementById('social-display');
        if (!container) return [];
        return Array.from(container.querySelectorAll('a.business-link-box')).map(a => {
            const iconEl = a.querySelector('i');
            const bgClass = Array.from(a.classList).find(c => c.startsWith('business-bg-')) || 'business-bg-web';
            return {
                label: a.textContent.trim(),
                url: a.getAttribute('href') || '#',
                bgClass,
                iconClass: iconEl ? iconEl.className : 'fa-solid fa-link'
            };
        });
    }

    function guessSocialMeta(label) {
        const l = String(label || '').toLowerCase();
        if (l.includes('map')) return { bgClass: 'business-bg-maps', iconClass: 'fa-solid fa-location-dot' };
        if (l.includes('mail')) return { bgClass: 'business-bg-mail', iconClass: 'fa-solid fa-envelope' };
        if (l.includes('app')) return { bgClass: 'business-bg-app', iconClass: 'fa-solid fa-mobile-screen' };
        if (l.includes('call') || l.includes('phone')) return { bgClass: 'business-bg-call', iconClass: 'fa-solid fa-phone' };
        if (l.includes('youtube') || l === 'yt') return { bgClass: 'business-bg-yt', iconClass: 'fa-brands fa-youtube' };
        if (l.includes('twitter') || l === 'x') return { bgClass: 'business-bg-twitter', iconClass: 'fa-brands fa-x-twitter' };
        if (l.includes('linkedin')) return { bgClass: 'business-bg-linkedin', iconClass: 'fa-brands fa-linkedin-in' };
        if (l.includes('insta')) return { bgClass: 'business-bg-insta', iconClass: 'fa-brands fa-instagram' };
        if (l.includes('telegram')) return { bgClass: 'business-bg-telegram', iconClass: 'fa-brands fa-telegram' };
        if (l.includes('wa') || l.includes('whatsapp')) return { bgClass: 'business-bg-wa-channel', iconClass: 'fa-brands fa-whatsapp' };
        if (l.includes('facebook') || l === 'fb') return { bgClass: 'business-bg-facebook', iconClass: 'fa-brands fa-facebook-f' };
        return { bgClass: 'business-bg-web', iconClass: 'fa-solid fa-globe' };
    }

    function renderSocial(links) {
        const container = document.getElementById('social-display');
        if (!container) return;
        if (!links.length) {
            container.innerHTML = '<span style="color:#8888a0; font-size:0.85rem;">No social links added.</span>';
            return;
        }
        container.innerHTML = links.map(link => {
            const guessed = guessSocialMeta(link.label);
            const bgClass = link.bgClass || guessed.bgClass;
            const iconClass = link.iconClass || guessed.iconClass;
            const href = link.url || '#';
            const isExternal = /^https?:/i.test(href);
            return `<a href="${esc(href)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="business-link-box ${esc(bgClass)}"><i class="${esc(iconClass)}"></i> ${esc(link.label)}</a>`;
        }).join('');
    }

    function readReviewsFromDom() {
        const container = document.getElementById('reviews-display');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.business-review-item')).map(item => ({
            reviewer: item.querySelector('.business-reviewer-name')?.textContent.trim() || 'Reviewer',
            date: item.querySelector('.business-review-date')?.textContent.trim() || 'Recently',
            stars: item.querySelectorAll('.business-rating-stars i.fa-star').length || 5,
            comment: item.querySelector('.business-review-comment')?.textContent.trim() || ''
        }));
    }

    function renderStarsHtml(count) {
        const n = Math.max(1, Math.min(5, Math.round(Number(count) || 5)));
        return Array.from({ length: n }, () => '<i class="fa-solid fa-star"></i>').join('');
    }

    function renderReviews(ratingScore, reviewCountText, reviews) {
        const ratingEl = document.getElementById('display-rating');
        const starsEl = document.getElementById('display-rating-stars');
        const countEl = document.getElementById('display-review-count');
        const listEl = document.getElementById('reviews-display');

        if (ratingEl && ratingScore) {
            const clean = String(ratingScore).includes('/') ? ratingScore : `${ratingScore} / 5`;
            ratingEl.textContent = clean;
            const numeric = parseFloat(String(ratingScore));
            if (starsEl && !Number.isNaN(numeric)) starsEl.innerHTML = renderStarsHtml(numeric);
        }
        if (countEl && reviewCountText !== undefined && reviewCountText !== null) {
            const textStr = String(reviewCountText).trim();
            countEl.textContent = /^\d+$/.test(textStr) ? `Based on ${textStr} verified reviews` : textStr;
        }
        if (listEl && Array.isArray(reviews)) {
            listEl.innerHTML = reviews.map(r => `
                <div class="business-review-item">
                    <div class="business-reviewer-header">
                        <span class="business-reviewer-name">${esc(r.reviewer || 'Reviewer')}</span>
                        <span class="business-review-date">${esc(r.date || 'Recently')}</span>
                    </div>
                    <div class="business-rating-stars" style="font-size:.75rem;margin-bottom:4px;">
                        ${renderStarsHtml(r.stars || 5)}
                    </div>
                    <p class="business-review-comment">${esc(r.comment || '')}</p>
                </div>
            `).join('');
        }
    }

    function readStaffFromDom() {
        const container = document.getElementById('staff-roles-container');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.business-staff-role-card')).map(card => ({
            name: card.querySelector('.business-staff-name')?.textContent.trim() || 'Staff',
            role: card.querySelector('.business-staff-role-title')?.textContent.trim() || 'Role',
            count: card.querySelector('.business-staff-count-badge')?.textContent.trim() || '1'
        }));
    }

    function renderStaff(roles) {
        const container = document.getElementById('staff-roles-container');
        if (!container) return;
        if (!roles.length) {
            container.innerHTML = '<div style="color:#8888a0; font-size:0.88rem; padding:12px 0;">No staff roles added yet.</div>';
            return;
        }
        container.innerHTML = roles.map(item => {
            const initial = (String(item.name || 'S').trim().charAt(0) || 'S').toUpperCase();
            const countNum = parseInt(String(item.count || '1'), 10) || 1;
            const iconClass = countNum > 1 ? 'fa-solid fa-users' : 'fa-solid fa-user';
            return `
                <div class="business-staff-role-card">
                    <div class="business-staff-avatar">${esc(initial)}</div>
                    <div class="business-staff-info">
                        <div class="business-staff-name">${esc(item.name)}</div>
                        <div class="business-staff-role-title">${esc(item.role)}</div>
                    </div>
                    <div class="business-staff-actions">
                        <span class="business-staff-count-badge">
                            <i class="${iconClass}"></i>
                            ${esc(item.count)}
                        </span>
                        <button class="business-btn-icon-action" onclick="openBusinessEditor('editStaff', this)">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="business-btn-icon-action business-btn-icon-danger" onclick="deleteBusinessStaffRole(this)">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function readWorkingHoursFromDom() {
        const el = document.getElementById('display-prof-hours');
        if (!el) return { weekday: '8:00 AM – 9:00 PM', sunday: '9:00 AM – 2:00 PM' };
        const text = el.innerText || '';
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const weekday = (lines[0] || '').replace(/^Monday\s*[–-]\s*Saturday:\s*/i, '') || '8:00 AM – 9:00 PM';
        const sunday = (lines[1] || '').replace(/^Sunday:\s*/i, '') || '9:00 AM – 2:00 PM';
        return { weekday, sunday };
    }

    function renderWorkingHours(weekday, sunday) {
        const el = document.getElementById('display-prof-hours');
        if (!el) return;
        el.innerHTML = `<b style="color:#fff;">Monday – Saturday:</b> ${esc(weekday || '8:00 AM – 9:00 PM')}<br><b style="color:#fff;">Sunday:</b> ${esc(sunday || '9:00 AM – 2:00 PM')}`;
    }

    window.syncBusinessFeedHeader = function () {
        const userFeedSection = document.getElementById('userFeedSection');
        if (!userFeedSection) return;

        const businessName = (document.getElementById('display-prof-name')?.textContent || '').trim() || 'BUSINESS NAME';
        const aboutRaw = (document.getElementById('display-prof-about')?.textContent || '').trim();
        const aboutText = aboutRaw === 'Write here about your business' ? '' : aboutRaw;

        const nameTitle = userFeedSection.querySelector('.profile-name-title');
        if (nameTitle && nameTitle.firstChild) {
            nameTitle.firstChild.nodeValue = businessName + ' ';
        }

        const aboutTag = userFeedSection.querySelector('.profile-about-tag');
        if (aboutTag) {
            let aboutSpan = aboutTag.querySelector('.business-feed-about-text');
            if (!aboutSpan) {
                aboutTag.textContent = 'About:';
                aboutSpan = document.createElement('span');
                aboutSpan.className = 'business-feed-about-text';
                aboutSpan.style.cssText = 'color: rgba(255,255,255,0.88); font-weight: 400; text-transform: none; margin-left: 6px; white-space: pre-line;';
                aboutTag.appendChild(aboutSpan);
            }
            aboutSpan.textContent = aboutText;
        }

        const initials = businessName
            .split(/\s+/)
            .map(part => part.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'B';

        let bizAvatarUrl = '';
        try {
            const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
            bizAvatarUrl = String(parsed?.profile?.avatar_url || '').trim();
        } catch {}
        userFeedSection.querySelectorAll('#userFeed .social-post-card:not([data-db-synced="true"]) .post-avatar').forEach(avatar => {
            if (bizAvatarUrl) {
                avatar.innerHTML = `<img src="${escapeHtml(bizAvatarUrl)}" alt="${escapeHtml(businessName)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" />`;
                avatar.style.overflow = 'hidden';
            } else {
                avatar.textContent = initials;
            }
        });
        userFeedSection.querySelectorAll('#userFeed .post-author-info h4').forEach(author => {
            if (author.firstChild) {
                author.firstChild.nodeValue = businessName + ' ';
            }
        });
    };

    function applyBusinessDataToDom(data) {
        if (!data) return;
        if (data.banner_url) {
            const img = document.getElementById('display-profile-banner-img');
            if (img) {
                const isData = String(data.banner_url).startsWith('data:');
                img.src = (!isData && typeof normalizeExternalMediaUrl === 'function')
                    ? normalizeExternalMediaUrl(data.banner_url)
                    : data.banner_url;
            }
        }
        if (data.business_name) {
            const el = document.getElementById('display-prof-name');
            if (el) el.textContent = data.business_name;
        }
        if (data.tagline) {
            const el = document.getElementById('display-prof-tagline');
            if (el) el.textContent = data.tagline;
        }
        if (data.about_business) {
            const el = document.getElementById('display-prof-about');
            if (el) el.textContent = data.about_business;
        }
        if (data.about_owner) {
            const el = document.getElementById('display-prof-owner');
            if (el) el.textContent = data.about_owner;
        }
        if (data.phone_number) {
            const el = document.getElementById('display-prof-phone');
            if (el) el.textContent = data.phone_number;
        }
        if (data.location) {
            const el = document.getElementById('display-prof-location');
            if (el) el.textContent = data.location;
        }
        if (data.mail) {
            const el = document.getElementById('display-prof-mail');
            if (el) el.textContent = data.mail;
        }
        if (data.working_hours_weekday || data.working_hours_sunday) {
            renderWorkingHours(data.working_hours_weekday, data.working_hours_sunday);
        }
        if (Array.isArray(data.listings) && data.listings.length > 0) {
            renderListings(data.listings);
        }
        if (Array.isArray(data.delivery_places) && data.delivery_places.length > 0) {
            renderDelivery(data.delivery_places);
        }
        if (Array.isArray(data.social_links) && data.social_links.length > 0) {
            renderSocial(data.social_links);
        }
        if (data.rating_score || data.review_count_text || (Array.isArray(data.reviews) && data.reviews.length > 0)) {
            renderReviews(data.rating_score, data.review_count_text, Array.isArray(data.reviews) && data.reviews.length > 0 ? data.reviews : null);
        }
        if (Array.isArray(data.staff_roles) && data.staff_roles.length > 0) {
            renderStaff(data.staff_roles);
        }
        window.syncBusinessFeedHeader();
    }

    async function persistBusinessPatch(patch) {
        const res = await fetch('/api/business/profile', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
            throw new Error(json?.error?.message || (res.status === 401 ? 'Please sign in to save your business changes.' : 'Could not save changes to database.'));
        }
        return json.data;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read selected image file.'));
            reader.readAsDataURL(file);
        });
    }

    window.loadBusinessProfileFromDatabase = async function () {
        try {
            const uid = (typeof getBusinessCatalogUserId === 'function' ? getBusinessCatalogUserId() : '') || '';
            const url = '/api/business/profile' + (uid ? ('?user_id=' + encodeURIComponent(uid)) : '');
            const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            if (json && json.success && json.data) {
                applyBusinessDataToDom(json.data);
                businessProfileLoaded = true;
            } else {
                const aboutEl = document.getElementById('display-prof-about');
                const ownerEl = document.getElementById('display-prof-owner');
                const nameEl = document.getElementById('display-prof-name');
                const tagEl = document.getElementById('display-prof-tagline');
                if (aboutEl) aboutEl.textContent = 'No business description added yet.';
                if (ownerEl) ownerEl.textContent = 'No owner details added yet.';
                if (nameEl) nameEl.textContent = 'BUSINESS NAME';
                if (tagEl) tagEl.textContent = '"BUSINESS TAGLINE"';
            }
        } catch (err) {
            console.warn('Could not load business profile:', err);
        }
    };

    window.closeBusinessEditor = function () {
        const modal = document.getElementById('businessEditModal');
        if (modal) modal.style.display = 'none';
        activeBusinessEditSection = null;
        activeStaffCard = null;
        showModalError('');
    };

    window.addBusinessListingEditRow = function (name = '', url = '') {
        const list = document.getElementById('bizListingRowsList');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'biz-listing-edit-row';
        row.style.cssText = 'display:flex; gap:8px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="listing-name" value="${esc(name)}" placeholder="Platform (e.g. Swiggy)" style="${inputStyle()} flex:1;">
            <input type="url" class="listing-url" value="${esc(url)}" placeholder="https://..." style="${inputStyle()} flex:1.3;">
            <button type="button" onclick="this.closest('.biz-listing-edit-row').remove()" style="${trashBtnStyle()}" title="Remove listing"><i class="fa-solid fa-trash"></i></button>
        `;
        list.appendChild(row);
    };

    window.addBusinessDeliveryEditRow = function (place = '') {
        const list = document.getElementById('bizDeliveryRowsList');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'biz-delivery-edit-row';
        row.style.cssText = 'display:flex; gap:8px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="delivery-name" value="${esc(place)}" placeholder="Enter delivery area..." style="${inputStyle()} flex:1;">
            <button type="button" onclick="this.closest('.biz-delivery-edit-row').remove()" style="${trashBtnStyle()}" title="Remove area"><i class="fa-solid fa-trash"></i></button>
        `;
        list.appendChild(row);
    };

    window.addBusinessReviewEditRow = function (reviewer = '', date = '', stars = 5, comment = '') {
        const list = document.getElementById('bizReviewsRowsList');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'biz-review-edit-row';
        row.style.cssText = 'background:#13141a; border:1px solid #2b2d38; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;';
        row.innerHTML = `
            <div style="display:flex; gap:8px;">
                <input type="text" class="rev-name" value="${esc(reviewer)}" placeholder="Reviewer name" style="${inputStyle()} flex:1.6;">
                <input type="number" class="rev-stars" min="1" max="5" value="${esc(stars)}" style="${inputStyle()} width:68px; flex:none;">
            </div>
            <input type="text" class="rev-date" value="${esc(date)}" placeholder="Date (e.g. 2 days ago)" style="${inputStyle()}">
            <textarea class="rev-comment" rows="2" placeholder="Review comment..." style="${inputStyle()} resize:vertical;">${esc(comment)}</textarea>
            <button type="button" onclick="this.closest('.biz-review-edit-row').remove()" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #5c242c; background:#2c181d; color:#f87171; font-weight:700; font-size:0.84rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;"><i class="fa-solid fa-trash"></i> Remove Review</button>
        `;
        list.appendChild(row);
    };

    window.openBusinessEditor = function (section, triggerEl) {
        const modal = document.getElementById('businessEditModal');
        const titleEl = document.getElementById('businessEditModalTitle');
        const subtitleEl = document.getElementById('businessEditModalSubtitle');
        const bodyEl = document.getElementById('businessEditModalBody');
        const saveBtn = document.getElementById('businessEditSaveBtn');
        if (!modal || !titleEl || !bodyEl) return;

        activeBusinessEditSection = section;
        activeStaffCard = triggerEl ? triggerEl.closest('.business-staff-role-card') : null;
        showModalError('');
        bodyEl.innerHTML = '';
        if (subtitleEl) {
            subtitleEl.style.display = 'none';
            subtitleEl.textContent = '';
        }
        if (saveBtn) saveBtn.textContent = 'Save Changes';

        const setSub = (txt) => {
            if (!subtitleEl) return;
            subtitleEl.textContent = txt;
            subtitleEl.style.display = 'block';
        };

        if (section === 'banner') {
            titleEl.textContent = 'Update Profile Banner Image';
            if (saveBtn) saveBtn.textContent = 'Update Image';
            const currentSrc = document.getElementById('display-profile-banner-img')?.getAttribute('src') || '';
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Upload Banner Image</label>
                    <input type="file" id="bizEditBannerFile" accept="image/*" style="${inputStyle()} padding:8px 10px;">
                </div>
            `;
        } else if (section === 'header') {
            titleEl.textContent = 'Edit Business Header';
            const currentName = document.getElementById('display-prof-name')?.textContent.trim() || '';
            const currentTagline = document.getElementById('display-prof-tagline')?.textContent.trim() || '';
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Business Name</label>
                    <input type="text" id="bizEditName" value="${esc(currentName)}" placeholder="BUSINESS NAME" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Tagline</label>
                    <input type="text" id="bizEditTagline" value="${esc(currentTagline)}" placeholder='"BUSINESS TAGLINE"' style="${inputStyle()}">
                </div>
            `;
        } else if (section === 'about') {
            titleEl.textContent = 'Edit About Business';
            setSub('Update the main description customers see about your business.');
            const currentAbout = document.getElementById('display-prof-about')?.textContent.trim() || '';
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Business Description</label>
                    <textarea id="bizEditAbout" rows="5" placeholder="Write here about your business" style="${inputStyle()} resize:vertical;">${esc(currentAbout)}</textarea>
                </div>
            `;
        } else if (section === 'owner') {
            titleEl.textContent = 'Edit Business Owner';
            setSub('Add information about the entrepreneur or business owner.');
            const currentOwner = document.getElementById('display-prof-owner')?.textContent.trim() || '';
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Owner Information</label>
                    <textarea id="bizEditOwner" rows="5" placeholder="Write about the business owner" style="${inputStyle()} resize:vertical;">${esc(currentOwner)}</textarea>
                </div>
            `;
        } else if (section === 'phone') {
            titleEl.textContent = 'Edit Phone Number';
            const currentVal = document.getElementById('display-prof-phone')?.textContent.trim() || '';
            const cleanVal = currentVal === 'Add phone number' ? '' : currentVal;
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Phone Number</label>
                    <input type="tel" id="bizEditPhone" value="${esc(cleanVal)}" placeholder="Enter phone number" style="${inputStyle()}">
                </div>
            `;
        } else if (section === 'location') {
            titleEl.textContent = 'Edit Location';
            const currentVal = document.getElementById('display-prof-location')?.textContent.trim() || '';
            const cleanVal = currentVal === 'Add business location' ? '' : currentVal;
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Location</label>
                    <input type="text" id="bizEditLocation" value="${esc(cleanVal)}" placeholder="Enter business location" style="${inputStyle()}">
                </div>
            `;
        } else if (section === 'mail') {
            titleEl.textContent = 'Edit Mail';
            const currentVal = document.getElementById('display-prof-mail')?.textContent.trim() || '';
            const cleanVal = currentVal === 'Add business email' ? '' : currentVal;
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Mail</label>
                    <input type="email" id="bizEditMail" value="${esc(cleanVal)}" placeholder="Enter business email" style="${inputStyle()}">
                </div>
            `;
        } else if (section === 'hours') {
            titleEl.textContent = 'Edit Working Hours';
            setSub('Set your business opening and closing schedule.');
            const hours = readWorkingHoursFromDom();
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Monday – Saturday</label>
                    <input type="text" id="bizEditHoursWeekday" value="${esc(hours.weekday)}" placeholder="8:00 AM – 9:00 PM" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Sunday</label>
                    <input type="text" id="bizEditHoursSunday" value="${esc(hours.sunday)}" placeholder="9:00 AM – 2:00 PM" style="${inputStyle()}">
                </div>
            `;
        } else if (section === 'addListing' || section === 'dropListing') {
            activeBusinessEditSection = 'listings';
            titleEl.textContent = 'Add / Drop Listings';
            setSub('Add new platforms or drop existing platforms where your business is listed.');
            if (saveBtn) saveBtn.textContent = 'Save Listings';
            const listings = readListingsFromDom();
            bodyEl.innerHTML = `
                <div id="bizListingRowsList" style="display:flex; flex-direction:column; gap:8px;"></div>
                <button type="button" onclick="addBusinessListingEditRow()" style="${dashedAddBtnStyle()}">+ Add Listing</button>
            `;
            listings.forEach(item => window.addBusinessListingEditRow(item.name, item.url));
            if (section === 'addListing' && listings.length === 0) window.addBusinessListingEditRow();
        } else if (section === 'delivery') {
            titleEl.textContent = 'Edit Delivery Places';
            setSub('Add the areas, cities, or locations where your business provides delivery.');
            const places = readDeliveryFromDom();
            bodyEl.innerHTML = `
                <div id="bizDeliveryRowsList" style="display:flex; flex-direction:column; gap:8px;"></div>
                <button type="button" onclick="addBusinessDeliveryEditRow()" style="${dashedAddBtnStyle()}">+ Add Delivery Area</button>
            `;
            places.forEach(p => window.addBusinessDeliveryEditRow(p));
            if (!places.length) window.addBusinessDeliveryEditRow();
        } else if (section === 'social') {
            titleEl.textContent = 'Edit Social Media';
            setSub('Update your business social and contact links.');
            const links = readSocialFromDom();
            bodyEl.innerHTML = `
                <div id="bizSocialGrid" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    ${links.map(l => `
                        <input type="text" class="social-url-input" data-label="${esc(l.label)}" data-bg="${esc(l.bgClass || '')}" data-icon="${esc(l.iconClass || '')}" value="${esc(l.url)}" placeholder="${esc(l.label)} URL" title="${esc(l.label)}" style="${inputStyle()} font-size:0.82rem; padding:8px 10px;">
                    `).join('')}
                </div>
            `;
        } else if (section === 'reviews') {
            titleEl.textContent = 'Edit Reviews & Ratings';
            const ratingRaw = document.getElementById('display-rating')?.textContent.trim() || '4.8 / 5';
            const ratingNum = ratingRaw.split('/')[0].trim();
            const countRaw = document.getElementById('display-review-count')?.textContent.trim() || '124';
            const countMatch = countRaw.match(/\d+/);
            const countNum = countMatch ? countMatch[0] : '0';
            const reviews = readReviewsFromDom();
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Overall Rating</label>
                    <input type="text" id="bizEditRatingScore" value="${esc(ratingNum)}" placeholder="4.8" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Number of Verified Reviews</label>
                    <input type="number" min="0" id="bizEditReviewCount" value="${esc(countNum)}" placeholder="0" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Customer Reviews</label>
                    <div id="bizReviewsRowsList" style="display:flex; flex-direction:column; gap:10px;"></div>
                </div>
                <button type="button" onclick="addBusinessReviewEditRow()" style="${dashedAddBtnStyle()}">+ Add Review</button>
            `;
            reviews.forEach(r => window.addBusinessReviewEditRow(r.reviewer, r.date, r.stars, r.comment));
        } else if (section === 'addStaff' || section === 'editStaff') {
            const isEdit = section === 'editStaff' && activeStaffCard;
            titleEl.textContent = isEdit ? 'Edit Staff Role' : 'Add Staff Role';
            const curName = isEdit ? (activeStaffCard.querySelector('.business-staff-name')?.textContent.trim() || '') : '';
            const curRole = isEdit ? (activeStaffCard.querySelector('.business-staff-role-title')?.textContent.trim() || '') : '';
            const curCount = isEdit ? (activeStaffCard.querySelector('.business-staff-count-badge')?.textContent.trim() || '1') : '1';
            bodyEl.innerHTML = `
                <div>
                    <label style="${labelStyle()}">Staff / Role Name</label>
                    <input type="text" id="bizEditStaffName" value="${esc(curName)}" placeholder="e.g. Delivery Persons" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Operation / Description</label>
                    <input type="text" id="bizEditStaffRole" value="${esc(curRole)}" placeholder="e.g. On Door Delivery" style="${inputStyle()}">
                </div>
                <div>
                    <label style="${labelStyle()}">Count</label>
                    <input type="number" min="1" id="bizEditStaffCount" value="${esc(curCount)}" style="${inputStyle()}">
                </div>
            `;
        }

        modal.style.display = 'flex';
    };

    window.saveBusinessEditor = async function () {
        if (!activeBusinessEditSection) return;
        const saveBtn = document.getElementById('businessEditSaveBtn');
        const origLabel = saveBtn ? saveBtn.textContent : 'Save Changes';
        showModalError('');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }

        try {
            let patch = {};

            if (activeBusinessEditSection === 'banner') {
                const fileInput = document.getElementById('bizEditBannerFile');
                const urlInput = document.getElementById('bizEditBannerUrl');
                let finalUrl = (urlInput?.value || '').trim();
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    finalUrl = await window.uploadImageToImgBB(fileInput.files[0], 'banner');
                }
                if (!finalUrl) throw new Error('Please choose an image file or paste an image URL.');
                const img = document.getElementById('display-profile-banner-img');
                if (img) {
                    img.src = (!finalUrl.startsWith('data:') && typeof normalizeExternalMediaUrl === 'function')
                        ? normalizeExternalMediaUrl(finalUrl)
                        : finalUrl;
                }
                patch = { banner_url: finalUrl };
            } else if (activeBusinessEditSection === 'header') {
                const name = (document.getElementById('bizEditName')?.value || '').trim() || 'BUSINESS NAME';
                const tagline = (document.getElementById('bizEditTagline')?.value || '').trim() || '"BUSINESS TAGLINE"';
                const nameEl = document.getElementById('display-prof-name');
                const tagEl = document.getElementById('display-prof-tagline');
                if (nameEl) nameEl.textContent = name;
                if (tagEl) tagEl.textContent = tagline;
                window.syncBusinessFeedHeader();
                patch = { business_name: name, tagline };
            } else if (activeBusinessEditSection === 'about') {
                const about = (document.getElementById('bizEditAbout')?.value || '').trim();
                const el = document.getElementById('display-prof-about');
                if (el) el.textContent = about || 'Write here about your business';
                window.syncBusinessFeedHeader();
                patch = { about_business: about };
            } else if (activeBusinessEditSection === 'owner') {
                const owner = (document.getElementById('bizEditOwner')?.value || '').trim();
                const el = document.getElementById('display-prof-owner');
                if (el) el.textContent = owner || 'Write about the business owner';
                patch = { about_owner: owner };
            } else if (activeBusinessEditSection === 'phone') {
                const val = (document.getElementById('bizEditPhone')?.value || '').trim();
                const el = document.getElementById('display-prof-phone');
                if (el) el.textContent = val || 'Add phone number';
                patch = { phone_number: val };
            } else if (activeBusinessEditSection === 'location') {
                const val = (document.getElementById('bizEditLocation')?.value || '').trim();
                const el = document.getElementById('display-prof-location');
                if (el) el.textContent = val || 'Add business location';
                patch = { location: val };
            } else if (activeBusinessEditSection === 'mail') {
                const val = (document.getElementById('bizEditMail')?.value || '').trim();
                const el = document.getElementById('display-prof-mail');
                if (el) el.textContent = val || 'Add business email';
                patch = { mail: val };
            } else if (activeBusinessEditSection === 'hours') {
                const weekday = (document.getElementById('bizEditHoursWeekday')?.value || '').trim() || '8:00 AM – 9:00 PM';
                const sunday = (document.getElementById('bizEditHoursSunday')?.value || '').trim() || '9:00 AM – 2:00 PM';
                renderWorkingHours(weekday, sunday);
                patch = { working_hours_weekday: weekday, working_hours_sunday: sunday };
            } else if (activeBusinessEditSection === 'listings') {
                const rows = Array.from(document.querySelectorAll('#bizListingRowsList .biz-listing-edit-row'));
                const listings = rows.map(r => {
                    const name = (r.querySelector('.listing-name')?.value || '').trim();
                    const url = (r.querySelector('.listing-url')?.value || '').trim() || '#';
                    if (!name) return null;
                    return { name, url };
                }).filter(Boolean);
                renderListings(listings);
                patch = { listings: readListingsFromDom() };
            } else if (activeBusinessEditSection === 'delivery') {
                const rows = Array.from(document.querySelectorAll('#bizDeliveryRowsList .biz-delivery-edit-row'));
                const places = rows.map(r => (r.querySelector('.delivery-name')?.value || '').trim()).filter(Boolean);
                renderDelivery(places);
                patch = { delivery_places: places };
            } else if (activeBusinessEditSection === 'social') {
                const inputs = Array.from(document.querySelectorAll('#bizSocialGrid .social-url-input'));
                const links = inputs.map(inp => {
                    const label = inp.dataset.label || 'Link';
                    const url = (inp.value || '').trim() || '#';
                    const meta = guessSocialMeta(label);
                    return {
                        label,
                        url,
                        bgClass: inp.dataset.bg || meta.bgClass,
                        iconClass: inp.dataset.icon || meta.iconClass
                    };
                });
                renderSocial(links);
                patch = { social_links: links };
            } else if (activeBusinessEditSection === 'reviews') {
                const rawScore = (document.getElementById('bizEditRatingScore')?.value || '').trim() || '4.8';
                const ratingScore = rawScore.includes('/') ? rawScore : `${rawScore} / 5`;
                const countNum = (document.getElementById('bizEditReviewCount')?.value || '0').trim();
                const reviewCountText = `Based on ${countNum || 0} verified reviews`;
                const rows = Array.from(document.querySelectorAll('#bizReviewsRowsList .biz-review-edit-row'));
                const reviews = rows.map(r => ({
                    reviewer: (r.querySelector('.rev-name')?.value || '').trim() || 'Reviewer',
                    date: (r.querySelector('.rev-date')?.value || '').trim() || 'Recently',
                    stars: Math.max(1, Math.min(5, parseInt(r.querySelector('.rev-stars')?.value || '5', 10) || 5)),
                    comment: (r.querySelector('.rev-comment')?.value || '').trim()
                })).filter(r => r.comment || r.reviewer);
                renderReviews(ratingScore, reviewCountText, reviews);
                patch = { rating_score: ratingScore, review_count_text: reviewCountText, reviews };
            } else if (activeBusinessEditSection === 'addStaff') {
                const name = (document.getElementById('bizEditStaffName')?.value || '').trim();
                const role = (document.getElementById('bizEditStaffRole')?.value || '').trim();
                const count = (document.getElementById('bizEditStaffCount')?.value || '1').trim() || '1';
                if (!name) throw new Error('Please enter a staff/role name.');
                const staff = readStaffFromDom();
                staff.push({ name, role: role || 'Staff', count });
                renderStaff(staff);
                patch = { staff_roles: staff };
            } else if (activeBusinessEditSection === 'editStaff' && activeStaffCard) {
                const name = (document.getElementById('bizEditStaffName')?.value || '').trim() || 'Staff';
                const role = (document.getElementById('bizEditStaffRole')?.value || '').trim() || 'Role';
                const count = (document.getElementById('bizEditStaffCount')?.value || '1').trim() || '1';
                const avatarEl = activeStaffCard.querySelector('.business-staff-avatar');
                const nameEl = activeStaffCard.querySelector('.business-staff-name');
                const roleEl = activeStaffCard.querySelector('.business-staff-role-title');
                const badgeEl = activeStaffCard.querySelector('.business-staff-count-badge');
                if (avatarEl) avatarEl.textContent = name.charAt(0).toUpperCase() || 'S';
                if (nameEl) nameEl.textContent = name;
                if (roleEl) roleEl.textContent = role;
                if (badgeEl) {
                    const iconClass = (parseInt(count, 10) || 1) > 1 ? 'fa-solid fa-users' : 'fa-solid fa-user';
                    badgeEl.innerHTML = `<i class="${iconClass}"></i> ${esc(count)}`;
                }
                patch = { staff_roles: readStaffFromDom() };
            }

            await persistBusinessPatch(patch);
            window.closeBusinessEditor();
        } catch (err) {
            showModalError(err instanceof Error ? err.message : 'Failed to save business changes.');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = origLabel;
            }
        }
    };

    window.deleteBusinessStaffRole = async function (btn) {
        const card = btn ? btn.closest('.business-staff-role-card') : null;
        if (!card) return;
        card.remove();
        const staff = readStaffFromDom();
        renderStaff(staff);
        try {
            await persistBusinessPatch({ staff_roles: staff });
        } catch (err) {
            console.warn('Could not persist deleted staff role:', err);
        }
    };

    const origToggleUserPage = window.toggleUserPage;
    if (typeof origToggleUserPage === 'function') {
        window.toggleUserPage = function () {
            origToggleUserPage.apply(this, arguments);
            if (!businessProfileLoaded || activeView === 'user') {
                void window.loadBusinessProfileFromDatabase();
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.syncBusinessFeedHeader();
            void window.loadBusinessProfileFromDatabase();
        });
    } else {
        window.syncBusinessFeedHeader();
        void window.loadBusinessProfileFromDatabase();
    }
})();

        /* === BUILD NETWORK (AUTO-CHANNEL PER ACCOUNT) === */
        let networksDbSynced = false;
        let lastSyncedNetworkAccountKey = '';

        function normalizeNetworkHandle(raw) {
            const cleaned = String(raw || '').trim().replace(/^(?:♾️|♾|∞|@)+/u, '').replace(/\s+/g, '').toLowerCase();
            return cleaned ? '@' + cleaned : '';
        }

        function getActiveAccountIdentity() {
            try {
                const parsed = JSON.parse(localStorage.getItem('userData') || 'null');
                if (parsed && parsed.profile && parsed.profile.id) {
                    return {
                        id: String(parsed.profile.id),
                        accountType: String(parsed.profile.account_type || 'personal').toLowerCase(),
                        username: normalizeNetworkHandle(parsed.profile.username || parsed.profile.display_name || '')
                    };
                }
            } catch {}
            return null;
        }

        function getCachedNetworks() {
            const identity = getActiveAccountIdentity();
            if (!identity) return [];
            try {
                const parsed = JSON.parse(localStorage.getItem('myNetworks') || '[]');
                if (!Array.isArray(parsed)) return [];
                return parsed.filter(n =>
                    n && (
                        (n.owner_id && String(n.owner_id) === identity.id && (!n.account_type || String(n.account_type).toLowerCase() === identity.accountType)) ||
                        (identity.username && normalizeNetworkHandle(n.username) === identity.username)
                    )
                );
            } catch {
                return [];
            }
        }

        function setCachedNetworks(list) {
            try {
                localStorage.setItem('myNetworks', JSON.stringify(Array.isArray(list) ? list : []));
            } catch {}
        }

        window.closeBuildNetworkPage = function () {};

        window.resetBuildNetworkSessionState = function () {
            networksDbSynced = false;
            lastSyncedNetworkAccountKey = '';
            try { localStorage.removeItem('myNetworks'); } catch {}
            if (typeof window.closeNetworkChatPage === 'function') window.closeNetworkChatPage();
        };

        window.onAccountSwitchedForNetwork = function () {
            networksDbSynced = false;
            lastSyncedNetworkAccountKey = '';
            try { localStorage.removeItem('myNetworks'); } catch {}
            if (typeof window.closeNetworkChatPage === 'function') window.closeNetworkChatPage();
            syncNetworksFromDatabase();
        };

        async function syncNetworksFromDatabase() {
            const identity = getActiveAccountIdentity();
            if (!identity) {
                networksDbSynced = false;
                lastSyncedNetworkAccountKey = '';
                setCachedNetworks([]);
                return [];
            }
            const accountKey = identity.id + ':' + identity.accountType;
            try {
                const qs = new URLSearchParams({
                    account_type: identity.accountType,
                    owner_id: identity.id
                });
                if (identity.username) {
                    qs.set('username', identity.username);
                }
                const res = await fetch('/api/networks?' + qs.toString(), { credentials: 'include', cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.success && Array.isArray(json.data)) {
                        networksDbSynced = true;
                        lastSyncedNetworkAccountKey = accountKey;
                        setCachedNetworks(json.data);
                        return json.data;
                    }
                } else if (res.status === 401) {
                    networksDbSynced = false;
                    lastSyncedNetworkAccountKey = '';
                    setCachedNetworks([]);
                    return [];
                }
            } catch {}
            return getCachedNetworks();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { syncNetworksFromDatabase(); });
        } else {
            syncNetworksFromDatabase();
        }

        window.openBuildNetworkPage = async function () {
            let identity = getActiveAccountIdentity();
            if (!identity) {
                try {
                    const meRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
                    if (meRes.ok) {
                        const meJson = await meRes.json();
                        if (meJson?.success && meJson?.data?.profile?.id) {
                            try { localStorage.setItem('userData', JSON.stringify(meJson.data)); } catch {}
                            identity = getActiveAccountIdentity();
                        }
                    }
                } catch {}
            }

            if (!identity) {
                window.resetBuildNetworkSessionState();
                window.location.href = '/login?type=personal&register=true';
                return;
            }

            const accountKey = identity.id + ':' + identity.accountType;
            let networks = getCachedNetworks();
            if (!networksDbSynced || lastSyncedNetworkAccountKey !== accountKey || networks.length === 0 || !networks[0]?.image_url) {
                networks = await syncNetworksFromDatabase();
            }

            if (networks.length === 0) {
                try {
                    const displayLabel = (identity.username || 'My Network').replace(/^@+/, '') || 'My Network';
                    const createRes = await fetch('/api/networks', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: displayLabel,
                            username: identity.username || ('@' + displayLabel.toLowerCase()),
                            description: 'Official channel for ' + displayLabel,
                            category: identity.accountType === 'business' ? 'Business' : (identity.accountType === 'creator' ? 'Jobs & Careers' : 'General'),
                            owner_id: identity.id,
                            account_type: identity.accountType
                        })
                    });
                    if (createRes.status === 401) {
                        window.location.href = '/login?type=' + encodeURIComponent(identity.accountType || 'personal') + '&register=true';
                        return;
                    }
                    const createJson = await createRes.json().catch(() => ({}));
                    if (createRes.ok && createJson?.success && createJson?.data) {
                        networks = [createJson.data];
                        setCachedNetworks(networks);
                        networksDbSynced = true;
                        lastSyncedNetworkAccountKey = accountKey;
                    }
                } catch {}
            }

            if (networks.length > 0) {
                await window.openNetworkChatPage(networks[0]);
            } else {
                const fallbackName = (identity.username || 'My Network').replace(/^@+/, '') || 'My Network';
                await window.openNetworkChatPage({
                    id: identity.id,
                    owner_id: identity.id,
                    account_type: identity.accountType,
                    name: fallbackName,
                    username: identity.username || ('@' + fallbackName.toLowerCase()),
                    supporters_count: 0
                });
            }
        };

        document.addEventListener('click', (e) => {
            if (e.target && e.target.closest && e.target.closest('.fixed-footer .footer-item')) {
                if (typeof window.closeNetworkChatPage === 'function') {
                    window.closeNetworkChatPage();
                }
                if (typeof window.closeJoinNetworkPage === 'function') {
                    window.closeJoinNetworkPage();
                }
            }
        }, true);

        /* === NETWORK CHAT OVERLAY === */
        let activeNetworkChatId = null;
        let activeNetworkCanSend = true;

        function updateNetworkChatInputPermission(canSend) {
            activeNetworkCanSend = Boolean(canSend);
            const input = document.getElementById('ncMessageInput');
            const sendBtn = document.querySelector('#networkChatOverlay .nc-send-btn');
            if (input) {
                input.disabled = !activeNetworkCanSend;
                input.placeholder = activeNetworkCanSend
                    ? 'Type a message...'
                    : 'Support this network to send messages...';
                if (!activeNetworkCanSend) input.value = '';
            }
            if (sendBtn) {
                sendBtn.disabled = !activeNetworkCanSend;
                sendBtn.style.opacity = activeNetworkCanSend ? '' : '0.45';
                sendBtn.style.pointerEvents = activeNetworkCanSend ? '' : 'none';
            }
        }

        function isUuid(val) {
            return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        }

        function formatMessageTime(isoOrText) {
            if (!isoOrText) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const d = new Date(isoOrText);
            if (!Number.isNaN(d.getTime())) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            return String(isoOrText);
        }

        function getCurrentViewerUserId() {
            try {
                const cached = JSON.parse(localStorage.getItem('userData') || 'null');
                return cached?.profile?.id || null;
            } catch {
                return null;
            }
        }

        async function resolveCurrentViewerUserId() {
            const activeId = getActiveAccountIdentity()?.id || getCurrentViewerUserId();
            if (activeId) return activeId;
            try {
                const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
                if (res.ok) {
                    const json = await res.json();
                    if (json?.success && json?.data?.profile?.id) {
                        try { localStorage.setItem('userData', JSON.stringify(json.data)); } catch {}
                        return json.data.profile.id;
                    }
                } else if (res.status === 401) {
                    try { localStorage.removeItem('userData'); } catch {}
                    return null;
                }
            } catch {}
            return null;
        }

        function appendNetworkMessageToDom(chatBody, textVal, timeVal, isSent = true, senderUsername = '') {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'nc-message ' + (isSent ? 'nc-sent' : 'nc-received');

            if (senderUsername) {
                const senderHeader = document.createElement('div');
                senderHeader.className = 'nc-msg-sender';
                senderHeader.textContent = senderUsername;
                messageDiv.appendChild(senderHeader);
            }

            const text = document.createElement('div');
            text.textContent = textVal;

            const time = document.createElement('div');
            time.className = 'nc-time';
            time.append(document.createTextNode(timeVal + (isSent ? ' ' : '')));

            if (isSent) {
                const ticks = document.createElement('span');
                ticks.className = 'nc-ticks';
                ticks.textContent = '✓';
                time.appendChild(ticks);
            }

            messageDiv.appendChild(text);
            messageDiv.appendChild(time);
            chatBody.appendChild(messageDiv);
        }

        window.openNetworkChatPage = async function (network, options) {
            const isFromJoinNetwork = Boolean(options && options.fromJoinNetwork);
            const overlay = document.getElementById('networkChatOverlay');
            const nameEl = document.getElementById('ncNetworkName');
            const imgEl = document.getElementById('ncProfileImg');
            const chatBody = document.getElementById('ncChatBody');
            if (!overlay || !chatBody) return;

            activeNetworkChatId = network?.id || 'default';
            if (nameEl) nameEl.textContent = network?.name || 'NETWORK NAME';
            const subEl = document.getElementById('ncNetworkSub');
            if (subEl) {
                const count = Number(network?.supporters_count ?? 0);
                subEl.textContent = '● ' + count + ' ' + (count === 1 ? 'supporter' : 'supporters');
            }
            const imgSrc = (network?.image_url || network?.image || '').trim();
            if (imgEl) {
                imgEl.src = imgSrc || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
            }

            chatBody.innerHTML = '<div class="nc-date-label">TODAY</div>';
            if (!isUuid(String(activeNetworkChatId))) {
                const initialUserId = getCurrentViewerUserId();
                try {
                    const saved = JSON.parse(localStorage.getItem('myNetworkMessages_' + activeNetworkChatId) || '[]');
                    if (Array.isArray(saved)) {
                        saved.forEach(m => {
                            const isSent = m.sender_id
                                ? Boolean(initialUserId && String(m.sender_id) === String(initialUserId))
                                : false;
                            appendNetworkMessageToDom(chatBody, m.text, m.time, isSent, m.sender_username || '');
                        });
                    }
                } catch {}
            }

            const footer = document.querySelector('.fixed-footer');
            if (footer) footer.style.display = 'flex';
            overlay.dataset.source = isFromJoinNetwork ? 'join-network' : 'build-network';
            const headerActions = overlay.querySelector('.nc-header-actions');
            if (headerActions) {
                headerActions.style.display = isFromJoinNetwork ? 'none' : '';
            }
            const activeIdForPerm = getActiveAccountIdentity();
            const isNetworkOwner = Boolean(
                !isFromJoinNetwork ||
                (activeIdForPerm && network && (
                    (network.owner_id && String(network.owner_id) === activeIdForPerm.id && (!network.account_type || String(network.account_type).toLowerCase() === activeIdForPerm.accountType)) ||
                    (activeIdForPerm.username && normalizeNetworkHandle(network.username) === activeIdForPerm.username)
                ))
            );
            updateNetworkChatInputPermission(isNetworkOwner || Boolean(network?.is_supported));

            window.closeNetworkAccountSwitcher();
            overlay.style.display = 'flex';
            chatBody.scrollTop = chatBody.scrollHeight;

            if (isUuid(String(activeNetworkChatId))) {
                const currentUserId = await resolveCurrentViewerUserId();
                try {
                    const netUrl = '/api/networks?all=true' + (currentUserId ? ('&viewer_id=' + encodeURIComponent(currentUserId)) : '');
                    const netRes = await fetch(netUrl, { credentials: 'include', cache: 'no-store' });
                    if (netRes.ok) {
                        const netJson = await netRes.json();
                        const matched = (netJson?.data || []).find(n => String(n.id) === String(activeNetworkChatId));
                        if (matched) {
                            if (subEl) {
                                const liveCount = Number(matched.supporters_count ?? 0);
                                subEl.textContent = '● ' + liveCount + ' ' + (liveCount === 1 ? 'supporter' : 'supporters');
                            }
                            const matchedOwner = Boolean(
                                activeIdForPerm && (
                                    (matched.owner_id && String(matched.owner_id) === activeIdForPerm.id && (!matched.account_type || String(matched.account_type).toLowerCase() === activeIdForPerm.accountType)) ||
                                    (activeIdForPerm.username && normalizeNetworkHandle(matched.username) === activeIdForPerm.username)
                                )
                            );
                            updateNetworkChatInputPermission(matchedOwner || Boolean(matched.is_supported));
                        }
                    }
                } catch {}
                try {
                    const msgUrl = '/api/networks/' + encodeURIComponent(activeNetworkChatId) + '/messages' + (currentUserId ? ('?viewer_id=' + encodeURIComponent(currentUserId)) : '');
                    const res = await fetch(msgUrl, {
                        credentials: 'include',
                        cache: 'no-store'
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json && json.success && Array.isArray(json.data)) {
                            chatBody.innerHTML = '<div class="nc-date-label">TODAY</div>';
                            const formatted = json.data.map(m => ({
                                text: m.content,
                                time: formatMessageTime(m.created_at),
                                sender_id: m.sender_id || null,
                                sender_username: m.sender_username || ''
                            }));
                            formatted.forEach(m => {
                                const isSent = Boolean(currentUserId && m.sender_id && String(m.sender_id) === String(currentUserId));
                                appendNetworkMessageToDom(chatBody, m.text, m.time, isSent, m.sender_username || '');
                            });
                            try {
                                localStorage.setItem('myNetworkMessages_' + activeNetworkChatId, JSON.stringify(formatted));
                            } catch {}
                            chatBody.scrollTop = chatBody.scrollHeight;
                        }
                    }
                } catch {}
            }
        };

        window.closeNetworkAccountSwitcher = function () {
            const bar = document.getElementById('ncAccountSwitcherBar');
            const header = document.getElementById('ncChatHeader');
            if (bar) {
                bar.style.display = 'none';
                bar.innerHTML = '';
            }
            if (header) header.style.display = 'flex';
        };

        window.openNetworkAccountSwitcher = function () {
            const overlay = document.getElementById('networkChatOverlay');
            if (overlay && overlay.dataset.source === 'join-network') return;
            const bar = document.getElementById('ncAccountSwitcherBar');
            const header = document.getElementById('ncChatHeader');
            if (!bar) return;

            const currentType = getActiveAccountIdentity()?.accountType || 'personal';
            const otherOptions = currentType === 'business'
                ? [
                    { type: 'personal', label: 'User', icon: 'fa-solid fa-user' },
                    { type: 'creator', label: 'Work', icon: 'fa-solid fa-briefcase' }
                ]
                : currentType === 'creator'
                    ? [
                        { type: 'personal', label: 'User', icon: 'fa-solid fa-user' },
                        { type: 'business', label: 'Business', icon: 'fa-solid fa-building' }
                    ]
                    : [
                        { type: 'business', label: 'Business', icon: 'fa-solid fa-building' },
                        { type: 'creator', label: 'Work', icon: 'fa-solid fa-briefcase' }
                    ];

            const btnStyle = 'background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.35); border-radius:10px; padding:8px 4px; color:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700; text-transform:uppercase;';
            const signOutStyle = 'background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.45); border-radius:10px; padding:8px 4px; color:#fda4af; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700; text-transform:uppercase;';
            const closeStyle = 'background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.25); border-radius:10px; padding:8px 4px; color:#fff; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:0.72rem; font-weight:700;';

            bar.innerHTML = `
                <button type="button" onclick="window.handleNetworkAccountSignOut('${currentType}')" style="${signOutStyle}" title="Sign Out">
                    <i class="fa-solid fa-right-from-bracket" style="font-size:1rem;"></i>
                    <span>Sign Out</span>
                </button>
                <button type="button" onclick="window.handleNetworkAccountSwitchOrSignIn('${otherOptions[0].type}')" style="${btnStyle}" title="Sign in as ${otherOptions[0].label}">
                    <i class="${otherOptions[0].icon}" style="font-size:1rem; color:#00f0ff;"></i>
                    <span>${otherOptions[0].label}</span>
                </button>
                <button type="button" onclick="window.handleNetworkAccountSwitchOrSignIn('${otherOptions[1].type}')" style="${btnStyle}" title="Sign in as ${otherOptions[1].label}">
                    <i class="${otherOptions[1].icon}" style="font-size:1rem; color:#00f0ff;"></i>
                    <span>${otherOptions[1].label}</span>
                </button>
                <button type="button" onclick="window.closeNetworkAccountSwitcher()" style="${closeStyle}" aria-label="Close" title="Close">
                    <i class="fa-solid fa-xmark" style="font-size:1.05rem;"></i>
                </button>
            `;
            if (header) header.style.display = 'none';
            bar.style.display = 'grid';
        };

        window.handleNetworkAccountSwitchOrSignIn = async function (targetType) {
            window.closeNetworkAccountSwitcher();
            let sessions = {};
            try {
                sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
            } catch {}
            if (sessions[targetType] && sessions[targetType].profile) {
                try {
                    localStorage.setItem('userData', JSON.stringify(sessions[targetType]));
                } catch {}
                if (typeof window.applyLoggedInState === 'function') {
                    window.applyLoggedInState(sessions[targetType]);
                } else {
                    window.onAccountSwitchedForNetwork();
                }
                await window.openBuildNetworkPage();
                return;
            }
            window.location.href = '/login?type=' + encodeURIComponent(targetType) + '&register=true';
        };

        window.handleNetworkAccountSignOut = async function (currentType) {
            window.closeNetworkAccountSwitcher();
            let sessions = {};
            let stack = [];
            try {
                sessions = JSON.parse(localStorage.getItem('infinityAccountSessions') || '{}') || {};
            } catch {}
            try {
                stack = JSON.parse(localStorage.getItem('infinityAccountStack') || '[]') || [];
                if (!Array.isArray(stack)) stack = [];
            } catch {}

            delete sessions[currentType];
            stack = stack.filter(t => t !== currentType);
            try {
                localStorage.setItem('infinityAccountSessions', JSON.stringify(sessions));
                localStorage.setItem('infinityAccountStack', JSON.stringify(stack));
            } catch {}

            const prevType = stack[stack.length - 1];
            if (prevType && sessions[prevType] && sessions[prevType].profile) {
                try {
                    localStorage.setItem('userData', JSON.stringify(sessions[prevType]));
                } catch {}
                if (typeof window.applyLoggedInState === 'function') {
                    window.applyLoggedInState(sessions[prevType]);
                } else {
                    window.onAccountSwitchedForNetwork();
                }
                await window.openBuildNetworkPage();
                return;
            }

            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            } catch {}
            try {
                localStorage.removeItem('userData');
                localStorage.removeItem('infinityAccountSessions');
                localStorage.removeItem('infinityAccountStack');
                localStorage.removeItem('myNetworks');
            } catch {}
            if (typeof window.applyLoggedOutState === 'function') {
                window.applyLoggedOutState();
            } else {
                window.resetBuildNetworkSessionState();
            }
            window.location.href = '/login?type=' + encodeURIComponent(currentType || 'personal') + '&register=true';
        };

        window.closeNetworkRecipientMenu = function () {
            const menu = document.getElementById('ncRecipientMenu');
            if (menu) {
                menu.style.display = 'none';
                menu.innerHTML = '';
            }
        };

        window.closeNetworkChatPage = function () {
            window.closeNetworkAccountSwitcher();
            window.closeNetworkRecipientMenu();
            const overlay = document.getElementById('networkChatOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.sendNetworkMessage = async function () {
            if (!activeNetworkCanSend) {
                window.closeNetworkRecipientMenu();
                return;
            }
            const input = document.getElementById('ncMessageInput');
            const menu = document.getElementById('ncRecipientMenu');
            if (!input || !menu) return;
            const message = input.value.trim();
            if (!message) return;

            menu.style.display = 'flex';
            menu.innerHTML = '<div class="nc-recipient-header"><span>Send to...</span><button type="button" class="nc-recipient-close" onclick="window.closeNetworkRecipientMenu()">✕</button></div><div style="font-size:0.8rem;color:#9aa0a6;padding:6px 0;">Loading supporters...</div>';

            let supporters = [];
            if (isUuid(String(activeNetworkChatId))) {
                try {
                    const res = await fetch('/api/networks/' + encodeURIComponent(activeNetworkChatId) + '/support', {
                        credentials: 'include',
                        cache: 'no-store'
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json && json.success && Array.isArray(json.data)) {
                            supporters = json.data;
                        }
                    }
                } catch {}
            }

            menu.replaceChildren();

            const header = document.createElement('div');
            header.className = 'nc-recipient-header';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = 'Select recipients';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'nc-recipient-close';
            closeBtn.textContent = '✕';
            closeBtn.onclick = window.closeNetworkRecipientMenu;
            header.append(titleSpan, closeBtn);
            menu.appendChild(header);

            const list = document.createElement('div');
            list.className = 'nc-recipient-list';

            const everyoneLabel = document.createElement('label');
            everyoneLabel.className = 'nc-recipient-item';
            const everyoneSpan = document.createElement('span');
            everyoneSpan.textContent = 'Everyone';
            everyoneSpan.style.fontWeight = '700';
            const everyoneCb = document.createElement('input');
            everyoneCb.type = 'checkbox';
            everyoneCb.checked = true;
            everyoneCb.value = 'everyone';
            everyoneLabel.append(everyoneSpan, everyoneCb);
            list.appendChild(everyoneLabel);

            const individualCheckboxes = [];
            supporters.forEach(s => {
                const row = document.createElement('label');
                row.className = 'nc-recipient-item';
                const nameSpan = document.createElement('span');
                nameSpan.textContent = s.username || s.display_name || 'Supporter';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = s.user_id;
                cb.checked = false;
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        everyoneCb.checked = false;
                    } else if (!individualCheckboxes.some(x => x.checked)) {
                        everyoneCb.checked = true;
                    }
                    updateSendBtnLabel();
                });
                individualCheckboxes.push(cb);
                row.append(nameSpan, cb);
                list.appendChild(row);
            });

            if (supporters.length === 0) {
                const emptyNote = document.createElement('div');
                emptyNote.style.cssText = 'font-size:0.78rem;color:#8696a0;padding:4px 2px;';
                emptyNote.textContent = 'No supporters yet.';
                list.appendChild(emptyNote);
            }

            everyoneCb.addEventListener('change', () => {
                if (everyoneCb.checked) {
                    individualCheckboxes.forEach(cb => { cb.checked = false; });
                } else if (!individualCheckboxes.some(x => x.checked)) {
                    everyoneCb.checked = true;
                }
                updateSendBtnLabel();
            });

            menu.appendChild(list);

            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'nc-recipient-send-btn';
            const updateSendBtnLabel = () => {
                if (everyoneCb.checked) {
                    confirmBtn.textContent = 'Send to Everyone';
                } else {
                    const count = individualCheckboxes.filter(x => x.checked).length;
                    confirmBtn.textContent = `Send to ${count} selected`;
                }
            };
            updateSendBtnLabel();

            confirmBtn.addEventListener('click', () => {
                const selectedIds = everyoneCb.checked
                    ? null
                    : individualCheckboxes.filter(x => x.checked).map(x => x.value);
                window.closeNetworkRecipientMenu();
                void window.confirmSendNetworkMessage(selectedIds);
            });

            menu.appendChild(confirmBtn);
        };

        window.confirmSendNetworkMessage = async function (recipientIds) {
            if (!activeNetworkCanSend) return;
            const chatBody = document.getElementById('ncChatBody');
            const input = document.getElementById('ncMessageInput');
            if (!chatBody || !input) return;
            const message = input.value.trim();
            if (!message) return;

            const currentUserId = getCurrentViewerUserId();
            const senderUsername = getActiveAccountIdentity()?.username || '';
            const timeVal = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            appendNetworkMessageToDom(chatBody, message, timeVal, true, senderUsername);

            try {
                const key = 'myNetworkMessages_' + (activeNetworkChatId || 'default');
                const saved = JSON.parse(localStorage.getItem(key) || '[]');
                if (Array.isArray(saved)) {
                    saved.push({ text: message, time: timeVal, sender_id: currentUserId, sender_username: senderUsername });
                    localStorage.setItem(key, JSON.stringify(saved));
                }
            } catch {}

            input.value = '';
            chatBody.scrollTop = chatBody.scrollHeight;

            if (isUuid(String(activeNetworkChatId))) {
                try {
                    const res = await fetch('/api/networks/' + encodeURIComponent(activeNetworkChatId) + '/messages', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: message,
                            sender_id: currentUserId || undefined,
                            recipient_ids: Array.isArray(recipientIds) && recipientIds.length > 0 ? recipientIds : null
                        })
                    });
                    if (res.status === 401) {
                        window.location.href = '/login?type=personal&register=true';
                    }
                } catch {}
            }
        };


        /* === JOIN NETWORK OVERLAY === */
        window.closeJoinNetworkPage = function () {
            const overlay = document.getElementById('joinNetworkOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.openJoinNetworkPage = async function () {
            const overlay = document.getElementById('joinNetworkOverlay');
            const listEl = document.getElementById('jnChatList');
            if (!overlay || !listEl) return;

            const footer = document.querySelector('.fixed-footer');
            if (footer) footer.style.display = 'flex';
            overlay.style.display = 'block';
            overlay.scrollTop = 0;

            listEl.innerHTML = '<div class="jn-empty-state">Loading networks...</div>';

            const activeIdentity = getActiveAccountIdentity();
            let networks = [];
            try {
                const joinUrl = '/api/networks?all=true' + (activeIdentity?.id ? ('&viewer_id=' + encodeURIComponent(activeIdentity.id)) : '');
                const res = await fetch(joinUrl, {
                    credentials: 'include',
                    cache: 'no-store'
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.success && Array.isArray(json.data)) {
                        networks = json.data;
                    }
                }
            } catch {}

            if (networks.length === 0) {
                const cached = getCachedNetworks();
                if (cached.length > 0) networks = cached;
            }
            if (activeIdentity) {
                networks = networks.filter(n => {
                    if (!n) return false;
                    const sameOwnerAndType = Boolean(
                        n.owner_id &&
                        String(n.owner_id) === activeIdentity.id &&
                        String(n.account_type || 'personal').toLowerCase() === activeIdentity.accountType
                    );
                    const sameUsername = Boolean(
                        activeIdentity.username &&
                        normalizeNetworkHandle(n.username) === activeIdentity.username
                    );
                    return !(sameOwnerAndType || sameUsername);
                });
            }

            if (networks.length === 0) {
                listEl.innerHTML = '<div class="jn-empty-state">No networks built yet.</div>';
                return;
            }

            listEl.replaceChildren();
            networks.forEach(network => {
                const item = document.createElement('div');
                item.className = 'jn-chat-item';
                item.addEventListener('click', () => {
                    window.openNetworkChatPage(network, { fromJoinNetwork: true });
                });

                const avatar = document.createElement('img');
                avatar.className = 'jn-avatar';
                const imgSrc = (network.image_url || network.image || '').trim();
                avatar.src = imgSrc || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                avatar.alt = network.name || network.username || 'Network';
                avatar.onerror = function () {
                    this.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                };

                const info = document.createElement('div');
                info.className = 'jn-chat-info';

                const header = document.createElement('div');
                header.className = 'jn-chat-header';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'jn-chat-name';
                nameDiv.textContent = network.username || network.name || 'Network';

                const supportBtn = document.createElement('button');
                supportBtn.type = 'button';
                supportBtn.className = 'jn-support-btn' + (network.is_supported ? ' supported' : '');
                supportBtn.textContent = network.is_supported ? 'Supporting...' : '+ SUPPORT';
                supportBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    window.toggleNetworkSupport(network, supportBtn);
                });

                header.appendChild(nameDiv);
                header.appendChild(supportBtn);

                const preview = document.createElement('div');
                preview.className = 'jn-chat-preview';
                const span = document.createElement('span');
                span.textContent = network.description || network.name || '';
                preview.appendChild(span);

                info.appendChild(header);
                info.appendChild(preview);

                item.appendChild(avatar);
                item.appendChild(info);
                listEl.appendChild(item);
            });
        };

        window.toggleNetworkSupport = async function (network, btn) {
            if (!network || !network.id) return;
            const prevSupported = Boolean(network.is_supported);
            const optimisticSupported = !prevSupported;
            if (btn) {
                btn.disabled = true;
                btn.classList.toggle('supported', optimisticSupported);
                btn.textContent = optimisticSupported ? 'Supporting...' : '+ SUPPORT';
            }
            try {
                const activeUid = getActiveAccountIdentity()?.id || getCurrentViewerUserId();
                const res = await fetch('/api/networks/' + encodeURIComponent(network.id) + '/support', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: activeUid || undefined })
                });
                if (res.status === 401) {
                    if (btn) {
                        btn.classList.toggle('supported', prevSupported);
                        btn.textContent = prevSupported ? 'Supporting...' : '+ SUPPORT';
                    }
                    window.location.href = '/login?type=personal&register=true';
                    return;
                }
                const json = await res.json().catch(() => ({}));
                if (!res.ok || !json?.success || !json?.data) {
                    if (btn) {
                        btn.classList.toggle('supported', prevSupported);
                        btn.textContent = prevSupported ? 'Supporting...' : '+ SUPPORT';
                    }
                    return;
                }

                const supported = Boolean(json.data.supported);
                const count = Number(json.data.supporters_count ?? 0);
                network.is_supported = supported;
                network.supporters_count = count;

                if (btn) {
                    btn.classList.toggle('supported', supported);
                    btn.textContent = supported ? 'Supporting...' : '+ SUPPORT';
                }

                const cached = getCachedNetworks().map(item =>
                    item && item.id === network.id ? { ...item, supporters_count: count, is_supported: supported } : item
                );
                setCachedNetworks(cached);

                if (String(activeNetworkChatId) === String(network.id)) {
                    const subEl = document.getElementById('ncNetworkSub');
                    if (subEl) {
                        subEl.textContent = '● ' + count + ' ' + (count === 1 ? 'supporter' : 'supporters');
                    }
                    updateNetworkChatInputPermission(supported);
                }
            } catch {
                if (btn) {
                    btn.classList.toggle('supported', prevSupported);
                    btn.textContent = prevSupported ? 'Supporting...' : '+ SUPPORT';
                }
            } finally {
                if (btn) btn.disabled = false;
            }
        };


        /* === PRIVATE TEAMS (BUILD TEAMS / JOIN TEAMS / TEAM CHAT) === */
        let activeTeamChat = null;
        let cachedOwnedTeams = [];
        let selectedTeamMembers = new Map();
        let memberSearchTimer = null;

        function setTeamStatusMsg(text, isError) {
            const el = document.getElementById('btStatusMsg');
            if (!el) return;
            if (!text) {
                el.style.display = 'none';
                el.textContent = '';
                return;
            }
            el.style.display = 'block';
            el.style.color = isError ? '#ff6b6b' : '#25d366';
            el.textContent = text;
        }

        async function fetchMyTeams() {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return [];
            try {
                const res = await fetch('/api/teams?viewer_id=' + encodeURIComponent(identity.id), {
                    credentials: 'include',
                    cache: 'no-store'
                });
                const json = await res.json();
                if (res.ok && json && json.success && Array.isArray(json.data)) {
                    return json.data;
                }
            } catch {}
            return [];
        }

        function renderMyCreatedTeams(teams) {
            const listEl = document.getElementById('btMyTeamsList');
            if (!listEl) return;
            if (!teams || teams.length === 0) {
                listEl.innerHTML = '<div style="color:#888; font-size:13px; padding:12px 0;">No teams yet. Tap + at the top right to build a team.</div>';
                return;
            }
            listEl.innerHTML = '';
            teams.forEach(team => {
                const card = document.createElement('div');
                card.className = 'jn-chat-item';
                card.style.cssText = 'background:#191c1f; border:1px solid #2a2f33; border-radius:10px; padding:12px;';
                card.innerHTML =
                    '<img class="jn-avatar" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" alt="Team">' +
                    '<div class="jn-chat-info">' +
                        '<div class="jn-chat-header"><span class="jn-chat-name">' + escapeHtml(team.name) + '</span></div>' +
                        '<div class="jn-chat-sub">' + Number(team.members_count || 1) + ' joined · ' + Number(team.pending_count || 0) + ' pending</div>' +
                    '</div>' +
                    '<button type="button" class="jn-support-btn">OPEN</button>';
                card.onclick = () => window.openTeamChatPage(team);
                listEl.appendChild(card);
            });
        }

        window.filterMyCreatedTeams = function (query) {
            const q = String(query || '').trim().toLowerCase();
            if (!q) {
                renderMyCreatedTeams(cachedOwnedTeams);
                return;
            }
            renderMyCreatedTeams(cachedOwnedTeams.filter(t => String(t.name || '').toLowerCase().includes(q)));
        };

        window.openBuildTeamsPage = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity) {
                window.location.href = '/login?type=personal&register=true';
                return;
            }
            const overlay = document.getElementById('buildTeamsOverlay');
            const listMode = document.getElementById('btListMode');
            const pickerMode = document.getElementById('btPickerMode');
            const nameMode = document.getElementById('btNameMode');
            const listEl = document.getElementById('btMyTeamsList');
            const filterEl = document.getElementById('btTeamsFilterInput');
            if (!overlay || !listEl) return;

            if (listMode) listMode.style.display = 'flex';
            if (pickerMode) pickerMode.style.display = 'none';
            if (nameMode) nameMode.style.display = 'none';
            if (filterEl) filterEl.value = '';
            document.body.classList.add('viewing-other-profile'); const _ff2 = document.querySelector('.fixed-footer'); if (_ff2) _ff2.style.display = 'none';
            overlay.style.bottom = '0';
            overlay.style.display = 'flex';
            overlay.scrollTop = 0;
            listEl.innerHTML = '<div style="color:#888; font-size:13px; padding:8px 0;">Loading your teams...</div>';

            const teams = await fetchMyTeams();
            cachedOwnedTeams = teams.filter(t => t.is_owner);
            renderMyCreatedTeams(cachedOwnedTeams);
        };

        window.closeBuildTeamsPage = function () {
            const overlay = document.getElementById('buildTeamsOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        function renderSelectedMemberChips() {
            const chipsEl = document.getElementById('btSelectedChips');
            if (!chipsEl) return;
            chipsEl.innerHTML = '';
            if (selectedTeamMembers.size === 0) {
                chipsEl.style.display = 'none';
                return;
            }
            chipsEl.style.display = 'flex';
            selectedTeamMembers.forEach((member, uid) => {
                const avatar = member.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                const item = document.createElement('div');
                item.style.cssText = 'display:flex; flex-direction:column; align-items:center; width:58px; flex-shrink:0;';
                item.innerHTML =
                    '<div style="position:relative; width:46px; height:46px;">' +
                        '<img src="' + escapeHtml(avatar) + '" alt="" style="width:46px; height:46px; border-radius:50%; object-fit:cover; background:#2a2d32;" />' +
                        '<button type="button" style="position:absolute; right:-2px; bottom:-2px; width:18px; height:18px; border-radius:50%; border:2px solid #141618; background:#667781; color:#fff; font-size:11px; line-height:1; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0;">×</button>' +
                    '</div>' +
                    '<span style="font-size:11px; color:#e9edef; margin-top:4px; max-width:58px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center;">' + escapeHtml((member.username || member.display_name || '').replace(/^@+/, '')) + '</span>';
                item.querySelector('button').onclick = () => {
                    selectedTeamMembers.delete(uid);
                    renderSelectedMemberChips();
                    const searchVal = document.getElementById('btMemberSearchInput')?.value || '';
                    loadTeamMemberSearchResults(searchVal);
                };
                chipsEl.appendChild(item);
            });
        }

        function highlightMatchedPrefix(text, query) {
            const safeText = escapeHtml(text || '');
            const q = String(query || '').trim().replace(/^@+/, '');
            if (!q) return safeText;
            const lower = String(text || '').toLowerCase();
            const idx = lower.indexOf(q.toLowerCase());
            if (idx === -1) return safeText;
            const before = escapeHtml(text.slice(0, idx));
            const match = escapeHtml(text.slice(idx, idx + q.length));
            const after = escapeHtml(text.slice(idx + q.length));
            return before + '<span style="color:#00a884;font-weight:700;">' + match + '</span>' + after;
        }

        async function loadTeamMemberSearchResults(query) {
            const resultsEl = document.getElementById('btMemberResultsList');
            if (!resultsEl) return;
            const identity = getActiveAccountIdentity();
            try {
                const url = '/api/teams/search-users?q=' + encodeURIComponent(query || '') +
                    (identity?.id ? ('&viewer_id=' + encodeURIComponent(identity.id)) : '');
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                const json = await res.json();
                const users = (res.ok && json?.success && Array.isArray(json.data)) ? json.data : [];

                if (users.length === 0) {
                    resultsEl.innerHTML = '<div style="padding:18px 16px; color:#888; font-size:13px;">No matching accounts found.</div>';
                    return;
                }

                resultsEl.innerHTML = '';
                users.forEach(u => {
                    const isSelected = selectedTeamMembers.has(u.id);
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:11px 16px; border-bottom:1px solid #1d2024; cursor:pointer;';
                    const avatar = u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                    row.innerHTML =
                        '<div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">' +
                            '<img src="' + escapeHtml(avatar) + '" alt="" style="width:42px; height:42px; border-radius:50%; object-fit:cover; background:#2a2d32; flex-shrink:0;" />' +
                            '<div style="min-width:0;">' +
                                '<div style="font-size:15px; color:#e9edef; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + highlightMatchedPrefix(u.username || u.display_name, query) + '</div>' +
                                '<div style="font-size:12px; color:#8696a0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(u.display_name || '') + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="width:22px; height:22px; border-radius:50%; border:2px solid ' + (isSelected ? '#00a884' : '#667781') + '; background:' + (isSelected ? '#00a884' : 'transparent') + '; display:flex; align-items:center; justify-content:center; color:#111b21; font-size:12px; font-weight:700; flex-shrink:0;">' + (isSelected ? '✓' : '') + '</div>';
                    row.onclick = () => {
                        const errEl = document.getElementById('btPickerError');
                        if (errEl) errEl.style.display = 'none';
                        if (selectedTeamMembers.has(u.id)) {
                            selectedTeamMembers.delete(u.id);
                        } else {
                            selectedTeamMembers.set(u.id, u);
                        }
                        renderSelectedMemberChips();
                        loadTeamMemberSearchResults(document.getElementById('btMemberSearchInput')?.value || '');
                    };
                    resultsEl.appendChild(row);
                });
            } catch {
                resultsEl.innerHTML = '<div style="padding:18px 16px; color:#888; font-size:13px;">Failed to search accounts.</div>';
            }
        }

        window.openBuildTeamPicker = function () {
            const listMode = document.getElementById('btListMode');
            const pickerMode = document.getElementById('btPickerMode');
            const nameMode = document.getElementById('btNameMode');
            const searchInput = document.getElementById('btMemberSearchInput');
            const nameInput = document.getElementById('btTeamName');
            const errEl = document.getElementById('btPickerError');
            selectedTeamMembers.clear();
            renderSelectedMemberChips();
            setTeamStatusMsg('');
            if (errEl) errEl.style.display = 'none';
            if (nameInput) nameInput.value = '';
            if (searchInput) searchInput.value = '';
            if (listMode) listMode.style.display = 'none';
            if (nameMode) nameMode.style.display = 'none';
            if (pickerMode) pickerMode.style.display = 'flex';
            loadTeamMemberSearchResults('');
            if (searchInput) searchInput.focus();
        };

        window.closeBuildTeamPicker = function () {
            const listMode = document.getElementById('btListMode');
            const pickerMode = document.getElementById('btPickerMode');
            const nameMode = document.getElementById('btNameMode');
            if (pickerMode) pickerMode.style.display = 'none';
            if (nameMode) nameMode.style.display = 'none';
            if (listMode) listMode.style.display = 'flex';
        };

        window.openBuildTeamNameStep = function () {
            const errEl = document.getElementById('btPickerError');
            if (selectedTeamMembers.size === 0) {
                if (errEl) {
                    errEl.textContent = 'Select at least 1 @username to invite to your team.';
                    errEl.style.display = 'block';
                }
                return;
            }
            if (errEl) errEl.style.display = 'none';

            const pickerMode = document.getElementById('btPickerMode');
            const nameMode = document.getElementById('btNameMode');
            const nameInput = document.getElementById('btTeamName');
            const labelEl = document.getElementById('btSelectedSummaryLabel');
            const gridEl = document.getElementById('btSelectedSummaryGrid');

            setTeamStatusMsg('');
            if (labelEl) labelEl.textContent = 'Members to invite (' + selectedTeamMembers.size + ')';
            if (gridEl) {
                gridEl.innerHTML = '';
                selectedTeamMembers.forEach((member) => {
                    const avatar = member.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                    const item = document.createElement('div');
                    item.style.cssText = 'display:flex; flex-direction:column; align-items:center; width:64px;';
                    item.innerHTML =
                        '<img src="' + escapeHtml(avatar) + '" alt="" style="width:48px; height:48px; border-radius:50%; object-fit:cover; background:#2a2d32;" />' +
                        '<span style="font-size:11px; color:#e9edef; margin-top:4px; max-width:64px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center;">' + escapeHtml(member.username || member.display_name) + '</span>';
                    gridEl.appendChild(item);
                });
            }

            if (pickerMode) pickerMode.style.display = 'none';
            if (nameMode) nameMode.style.display = 'flex';
            if (nameInput) nameInput.focus();
        };

        window.backToBuildTeamPicker = function () {
            const pickerMode = document.getElementById('btPickerMode');
            const nameMode = document.getElementById('btNameMode');
            if (nameMode) nameMode.style.display = 'none';
            if (pickerMode) pickerMode.style.display = 'flex';
        };

        window.onTeamMemberSearchInput = function (val) {
            if (memberSearchTimer) clearTimeout(memberSearchTimer);
            memberSearchTimer = setTimeout(() => {
                loadTeamMemberSearchResults(val);
            }, 120);
        };

        window.clearTeamMemberSearch = function () {
            const searchInput = document.getElementById('btMemberSearchInput');
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            loadTeamMemberSearchResults('');
        };

        window.submitCreateTeam = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) {
                window.location.href = '/login?type=personal&register=true';
                return;
            }
            const nameEl = document.getElementById('btTeamName');
            const btn = document.getElementById('btCreateBtn');
            const name = (nameEl?.value || '').trim();
            const invite_usernames = Array.from(selectedTeamMembers.values()).map(m => m.username).filter(Boolean);

            if (!name) {
                setTeamStatusMsg('Please enter a group name.', true);
                if (nameEl) nameEl.focus();
                return;
            }

            if (btn) btn.disabled = true;
            setTeamStatusMsg('Creating group & sending join requests...', false);
            try {
                const res = await fetch('/api/teams', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name,
                        owner_id: identity.id,
                        account_type: identity.accountType,
                        invite_usernames
                    })
                });
                const json = await res.json();
                if (!res.ok || !json?.success) {
                    setTeamStatusMsg(json?.error?.message || 'Could not create team.', true);
                    return;
                }
                selectedTeamMembers.clear();
                renderSelectedMemberChips();
                if (nameEl) nameEl.value = '';
                await window.openBuildTeamsPage();
            } catch {
                setTeamStatusMsg('Network error creating team.', true);
            } finally {
                if (btn) btn.disabled = false;
            }
        };

        window.openJoinTeamsPage = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) {
                window.location.href = '/login?type=personal&register=true';
                return;
            }
            const overlay = document.getElementById('joinTeamsOverlay');
            const listEl = document.getElementById('jtChatList');
            if (!overlay || !listEl) return;

            overlay.style.display = 'flex';
            overlay.scrollTop = 0;
            listEl.innerHTML = '<div class="jn-empty-state">Loading teams &amp; join requests...</div>';

            const teams = await fetchMyTeams();
            const pending = teams.filter(t => t.membership_status === 'pending');
            const joined = teams.filter(t => t.membership_status === 'accepted');

            listEl.innerHTML = '';

            if (pending.length === 0 && joined.length === 0) {
                listEl.innerHTML = '<div class="jn-empty-state">No team invitations or joined teams yet.</div>';
                return;
            }

            if (pending.length > 0) {
                const hdr = document.createElement('div');
                hdr.style.cssText = 'padding:10px 16px; font-size:12px; font-weight:700; color:#25d366; letter-spacing:0.5px;';
                hdr.textContent = 'JOIN REQUESTS (' + pending.length + ')';
                listEl.appendChild(hdr);

                pending.forEach(team => {
                    const row = document.createElement('div');
                    row.className = 'jn-chat-item';
                    row.style.cursor = 'default';
                    row.innerHTML =
                        '<img class="jn-avatar" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" alt="Team">' +
                        '<div class="jn-chat-info">' +
                            '<div class="jn-chat-header"><span class="jn-chat-name">' + escapeHtml(team.name) + '</span></div>' +
                            '<div class="jn-chat-sub">Invited by ' + escapeHtml(team.owner_username || 'owner') + '</div>' +
                        '</div>' +
                        '<div style="display:flex; gap:6px; flex-shrink:0;">' +
                            '<button type="button" class="jn-support-btn" data-act="accept">JOIN</button>' +
                            '<button type="button" class="jn-support-btn" style="background:#333; color:#fff;" data-act="decline">DECLINE</button>' +
                        '</div>';
                    row.querySelector('[data-act="accept"]').onclick = () => window.respondToTeamInvite(team.id, 'accept');
                    row.querySelector('[data-act="decline"]').onclick = () => window.respondToTeamInvite(team.id, 'decline');
                    listEl.appendChild(row);
                });
            }

            if (joined.length > 0) {
                const hdr2 = document.createElement('div');
                hdr2.style.cssText = 'padding:12px 16px 6px; font-size:12px; font-weight:700; color:#9ba3ab; letter-spacing:0.5px;';
                hdr2.textContent = 'JOINED TEAMS (' + joined.length + ')';
                listEl.appendChild(hdr2);

                joined.forEach(team => {
                    const row = document.createElement('div');
                    row.className = 'jn-chat-item';
                    row.innerHTML =
                        '<img class="jn-avatar" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" alt="Team">' +
                        '<div class="jn-chat-info">' +
                            '<div class="jn-chat-header"><span class="jn-chat-name">' + escapeHtml(team.name) + '</span></div>' +
                            '<div class="jn-chat-sub">' + Number(team.members_count || 1) + ' members</div>' +
                        '</div>' +
                        '<button type="button" class="jn-support-btn">CHAT</button>';
                    row.onclick = () => window.openTeamChatPage(team);
                    listEl.appendChild(row);
                });
            }
        };

        window.closeJoinTeamsPage = function () {
            const overlay = document.getElementById('joinTeamsOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.respondToTeamInvite = async function (teamId, action) {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return;
            try {
                const res = await fetch('/api/teams/' + encodeURIComponent(teamId) + '/respond', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, user_id: identity.id })
                });
                if (res.ok) {
                    await window.openJoinTeamsPage();
                }
            } catch {}
        };

        window.openTeamChatPage = async function (team) {
            const overlay = document.getElementById('teamChatOverlay');
            const nameEl = document.getElementById('tcTeamName');
            const subEl = document.getElementById('tcTeamSub');
            const bodyEl = document.getElementById('tcChatBody');
            const invBtn = document.getElementById('tcInviteBtn');
            if (!overlay || !bodyEl || !team) return;

            activeTeamChat = team;
            if (nameEl) nameEl.textContent = team.name;
            if (subEl) subEl.textContent = '● ' + Number(team.members_count || 1) + ' members · Private Team';
            if (invBtn) invBtn.style.display = team.is_owner ? 'inline-block' : 'none';

            overlay.style.display = 'flex';
            bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div><div style="text-align:center;color:#888;font-size:12px;">Loading team messages...</div>';

            const identity = getActiveAccountIdentity();
            try {
                const res = await fetch('/api/teams/' + encodeURIComponent(team.id) + '/messages?viewer_id=' + encodeURIComponent(identity?.id || ''), {
                    credentials: 'include',
                    cache: 'no-store'
                });
                const json = await res.json();
                bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div>';
                if (!res.ok || !json?.success) {
                    bodyEl.innerHTML += '<div style="text-align:center;color:#ff6b6b;font-size:13px;padding:16px;">' + escapeHtml(json?.error?.message || 'Only joined members can view this chat.') + '</div>';
                    return;
                }
                const msgs = Array.isArray(json.data) ? json.data : [];
                msgs.forEach(m => {
                    const isSent = Boolean(identity?.id && String(m.sender_id) === String(identity.id));
                    const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    appendNetworkMessageToDom(bodyEl, m.content, timeStr, isSent, m.sender_username || '');
                });
                bodyEl.scrollTop = bodyEl.scrollHeight;
            } catch {
                bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div>';
            }
        };

        window.closeTeamChatPage = function () {
            const overlay = document.getElementById('teamChatOverlay');
            if (overlay) overlay.style.display = 'none';
            activeTeamChat = null;
        };

        window.sendTeamMessage = async function () {
            if (!activeTeamChat) return;
            const input = document.getElementById('tcMessageInput');
            const bodyEl = document.getElementById('tcChatBody');
            const content = (input?.value || '').trim();
            if (!content) return;

            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return;

            input.value = '';
            try {
                const res = await fetch('/api/teams/' + encodeURIComponent(activeTeamChat.id) + '/messages', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, sender_id: identity.id })
                });
                const json = await res.json();
                if (res.ok && json?.success && json.data) {
                    const timeStr = json.data.created_at ? new Date(json.data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    appendNetworkMessageToDom(bodyEl, json.data.content, timeStr, true, json.data.sender_username || '');
                    bodyEl.scrollTop = bodyEl.scrollHeight;
                }
            } catch {}
        };

        window.inviteMoreTeamMembers = async function () {
            if (!activeTeamChat || !activeTeamChat.is_owner) return;
            const raw = window.prompt('Enter @username(s) to send team join requests (comma separated):');
            if (!raw || !raw.trim()) return;
            const usernames = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id || usernames.length === 0) return;
            try {
                const res = await fetch('/api/teams/' + encodeURIComponent(activeTeamChat.id) + '/invite', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usernames, user_id: identity.id })
                });
                const json = await res.json();
                if (res.ok && json?.success) {
                    const inv = json.data?.invited_usernames || [];
                    const nf = json.data?.not_found_usernames || [];
                    alert((inv.length ? 'Sent join requests to: ' + inv.join(', ') + '. ' : '') + (nf.length ? 'Not found: ' + nf.join(', ') : ''));
                }
            } catch {}
        };


        /* === INDIVIDUAL 1-ON-1 SEARCH & DIRECT CHAT === */
        let activeIndividualPeer = null;
        let indSearchTimer = null;

        async function loadIndividualUsersAndChats(query) {
            const listEl = document.getElementById('indResultsList');
            if (!listEl) return;
            const identity = getActiveAccountIdentity();
            const viewerId = identity?.id || '';
            const trimmed = String(query || '').trim();

            try {
                if (!trimmed) {
                    const [recentRes, usersRes] = await Promise.all([
                        viewerId
                            ? fetch('/api/direct-messages?viewer_id=' + encodeURIComponent(viewerId), { credentials: 'include', cache: 'no-store' })
                            : Promise.resolve(null),
                        fetch('/api/teams/search-users?q=&viewer_id=' + encodeURIComponent(viewerId), { credentials: 'include', cache: 'no-store' })
                    ]);

                    const recentJson = recentRes && recentRes.ok ? await recentRes.json() : null;
                    const usersJson = usersRes && usersRes.ok ? await usersRes.json() : null;
                    const recent = (recentJson?.success && Array.isArray(recentJson.data)) ? recentJson.data : [];
                    const allUsers = (usersJson?.success && Array.isArray(usersJson.data)) ? usersJson.data : [];

                    listEl.innerHTML = '';
                    const recentIds = new Set(recent.map(r => r.id));

                    if (recent.length > 0) {
                        const hdr = document.createElement('div');
                        hdr.style.cssText = 'padding:10px 16px 6px; font-size:12px; font-weight:700; color:#25d366; letter-spacing:0.5px;';
                        hdr.textContent = 'RECENT CHATS';
                        listEl.appendChild(hdr);

                        recent.forEach(u => {
                            const row = document.createElement('div');
                            row.className = 'jn-chat-item';
                            const avatar = u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                            row.innerHTML =
                                '<img class="jn-avatar" src="' + escapeHtml(avatar) + '" alt="">' +
                                '<div class="jn-chat-info">' +
                                    '<div class="jn-chat-header"><span class="jn-chat-name">' + escapeHtml(u.username || u.display_name) + '</span></div>' +
                                    '<div class="jn-chat-sub">' + escapeHtml(u.last_message || u.display_name || '') + '</div>' +
                                '</div>' +
                                '<button type="button" class="jn-support-btn">CHAT</button>';
                            row.onclick = () => window.openIndividualChat(u);
                            listEl.appendChild(row);
                        });
                    }

                    const others = allUsers.filter(u => !recentIds.has(u.id));
                    if (others.length > 0) {
                        const hdr2 = document.createElement('div');
                        hdr2.style.cssText = 'padding:12px 16px 6px; font-size:12px; font-weight:700; color:#9ba3ab; letter-spacing:0.5px;';
                        hdr2.textContent = 'ACCOUNTS';
                        listEl.appendChild(hdr2);

                        others.forEach(u => {
                            const row = document.createElement('div');
                            row.className = 'jn-chat-item';
                            const avatar = u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                            row.innerHTML =
                                '<img class="jn-avatar" src="' + escapeHtml(avatar) + '" alt="">' +
                                '<div class="jn-chat-info">' +
                                    '<div class="jn-chat-header"><span class="jn-chat-name">' + escapeHtml(u.username || u.display_name) + '</span></div>' +
                                    '<div class="jn-chat-sub">' + escapeHtml(u.display_name || '') + '</div>' +
                                '</div>' +
                                '<button type="button" class="jn-support-btn">CHAT</button>';
                            row.onclick = () => window.openIndividualChat(u);
                            listEl.appendChild(row);
                        });
                    }

                    if (recent.length === 0 && others.length === 0) {
                        listEl.innerHTML = '<div style="padding:20px 16px; color:#888; font-size:13px; text-align:center;">No accounts found yet.</div>';
                    }
                    return;
                }

                const res = await fetch('/api/teams/search-users?q=' + encodeURIComponent(trimmed) + '&viewer_id=' + encodeURIComponent(viewerId), {
                    credentials: 'include',
                    cache: 'no-store'
                });
                const json = await res.json();
                const users = (res.ok && json?.success && Array.isArray(json.data)) ? json.data : [];

                if (users.length === 0) {
                    listEl.innerHTML = '<div style="padding:20px 16px; color:#888; font-size:13px; text-align:center;">No matching accounts found.</div>';
                    return;
                }

                listEl.innerHTML = '';
                users.forEach(u => {
                    const row = document.createElement('div');
                    row.className = 'jn-chat-item';
                    const avatar = u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                    row.innerHTML =
                        '<img class="jn-avatar" src="' + escapeHtml(avatar) + '" alt="">' +
                        '<div class="jn-chat-info">' +
                            '<div class="jn-chat-header"><span class="jn-chat-name">' + highlightMatchedPrefix(u.username || u.display_name, trimmed) + '</span></div>' +
                            '<div class="jn-chat-sub">' + escapeHtml(u.display_name || '') + '</div>' +
                        '</div>' +
                        '<button type="button" class="jn-support-btn">CHAT</button>';
                    row.onclick = () => window.openIndividualChat(u);
                    listEl.appendChild(row);
                });
            } catch {
                listEl.innerHTML = '<div style="padding:20px 16px; color:#888; font-size:13px; text-align:center;">Failed to load accounts.</div>';
            }
        }

        window.openIndividualPage = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity) {
                window.location.href = '/login?type=personal&register=true';
                return;
            }
            const overlay = document.getElementById('individualOverlay');
            const input = document.getElementById('indSearchInput');
            const listEl = document.getElementById('indResultsList');
            if (!overlay || !listEl) return;

            if (input) input.value = '';
            overlay.style.display = 'flex';
            overlay.scrollTop = 0;
            listEl.innerHTML = '<div style="padding:20px 16px; color:#888; font-size:13px; text-align:center;">Loading accounts...</div>';
            await loadIndividualUsersAndChats('');
        };

        window.closeIndividualPage = function () {
            const overlay = document.getElementById('individualOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.onIndividualSearchInput = function (val) {
            if (indSearchTimer) clearTimeout(indSearchTimer);
            indSearchTimer = setTimeout(() => {
                loadIndividualUsersAndChats(val);
            }, 120);
        };

        window.openIndividualChat = async function (peer) {
            const overlay = document.getElementById('individualChatOverlay');
            const nameEl = document.getElementById('icPeerName');
            const subEl = document.getElementById('icPeerSub');
            const imgEl = document.getElementById('icProfileImg');
            const bodyEl = document.getElementById('icChatBody');
            if (!overlay || !bodyEl || !peer) return;

            activeIndividualPeer = peer;
            if (nameEl) nameEl.textContent = peer.username || peer.display_name || 'User';
            if (subEl) subEl.textContent = '● ' + (peer.display_name || 'Direct Chat');
            if (imgEl) imgEl.src = peer.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

            overlay.style.display = 'flex';
            bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div><div style="text-align:center;color:#888;font-size:12px;">Loading messages...</div>';

            const identity = getActiveAccountIdentity();
            try {
                const res = await fetch('/api/direct-messages/' + encodeURIComponent(peer.id) + '?viewer_id=' + encodeURIComponent(identity?.id || ''), {
                    credentials: 'include',
                    cache: 'no-store'
                });
                const json = await res.json();
                bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div>';
                const msgs = (res.ok && json?.success && Array.isArray(json.data)) ? json.data : [];
                msgs.forEach(m => {
                    const isSent = Boolean(identity?.id && String(m.sender_id) === String(identity.id));
                    const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    appendNetworkMessageToDom(bodyEl, m.content, timeStr, isSent, '');
                });
                bodyEl.scrollTop = bodyEl.scrollHeight;
            } catch {
                bodyEl.innerHTML = '<div class="nc-date-label">TODAY</div>';
            }
        };

        window.closeIndividualChat = function () {
            const overlay = document.getElementById('individualChatOverlay');
            if (overlay) overlay.style.display = 'none';
            activeIndividualPeer = null;
        };

        window.sendIndividualMessage = async function () {
            if (!activeIndividualPeer) return;
            const input = document.getElementById('icMessageInput');
            const bodyEl = document.getElementById('icChatBody');
            const content = (input?.value || '').trim();
            if (!content) return;

            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return;

            input.value = '';
            try {
                const res = await fetch('/api/direct-messages/' + encodeURIComponent(activeIndividualPeer.id), {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, sender_id: identity.id })
                });
                const json = await res.json();
                if (res.ok && json?.success && json.data) {
                    const timeStr = json.data.created_at ? new Date(json.data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    appendNetworkMessageToDom(bodyEl, json.data.content, timeStr, true, '');
                    bodyEl.scrollTop = bodyEl.scrollHeight;
                }
            } catch {}
        };


        /* === MYSELF PRIVATE SAVED CHAT (TEXT, PHOTO, VIDEO, FILE, AUDIO) === */
        let pendingMyselfFile = null;

        function appendMyselfItemToDom(chatBody, item) {
            if (!chatBody || !item) return;
            const bubble = document.createElement('div');
            bubble.className = 'nc-message nc-sent';
            bubble.dataset.itemId = item.id || '';

            let mediaHtml = '';
            const url = escapeHtml(item.media_url || '');
            const fname = escapeHtml(item.file_name || 'Attachment');

            if (item.item_type === 'image' && item.media_url) {
                mediaHtml = '<img src="' + url + '" alt="' + fname + '" style="max-width:100%; border-radius:8px; margin-bottom:6px; display:block;" />';
            } else if (item.item_type === 'video' && item.media_url) {
                mediaHtml = '<video src="' + url + '" controls playsinline style="max-width:100%; border-radius:8px; margin-bottom:6px; display:block;"></video>';
            } else if (item.item_type === 'audio' && item.media_url) {
                mediaHtml = '<audio src="' + url + '" controls style="width:220px; max-width:100%; margin-bottom:6px; display:block;"></audio>';
            } else if (item.item_type === 'file' && item.media_url) {
                mediaHtml = '<a href="' + url + '" download="' + fname + '" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:8px; color:#fff; text-decoration:none; margin-bottom:6px; font-size:13px;"><i class="fa-solid fa-file-arrow-down" style="color:#25d366;"></i><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + fname + '</span></a>';
            }

            const textHtml = item.content ? '<div style="white-space:pre-wrap;">' + escapeHtml(item.content) + '</div>' : '';
            const timeStr = item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            bubble.innerHTML =
                mediaHtml +
                textHtml +
                '<div class="nc-time" style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">' +
                    '<span>' + escapeHtml(timeStr) + '</span>' +
                    '<button type="button" onclick="deleteMyselfItem(\'' + escapeHtml(item.id || '') + '\', this)" title="Delete" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:11px; padding:0;"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';

            chatBody.appendChild(bubble);
        }

        window.openMyselfComposer = function () {
            const bodyEl = document.getElementById('msChatBody');
            const panelEl = document.getElementById('msAttachPanel');
            if (bodyEl) bodyEl.style.display = 'none';
            if (panelEl) panelEl.style.display = 'flex';
        };

        window.closeMyselfComposer = function () {
            const bodyEl = document.getElementById('msChatBody');
            const panelEl = document.getElementById('msAttachPanel');
            if (panelEl) panelEl.style.display = 'none';
            if (bodyEl) bodyEl.style.display = 'flex';
        };

        window.syncMyselfTextFromBar = function (val) {
            const panelInput = document.getElementById('msPanelTextInput');
            if (panelInput && panelInput.value !== val) panelInput.value = val;
        };

        window.syncMyselfTextFromPanel = function (val) {
            const barInput = document.getElementById('msMessageInput');
            if (barInput && barInput.value !== val) barInput.value = val;
        };

        window.onMyselfFileSelected = function (inputEl) {
            const file = inputEl?.files?.[0] || null;
            pendingMyselfFile = file;
            const bar = document.getElementById('msPendingFileBar');
            const nameEl = document.getElementById('msPendingFileName');
            if (file && bar && nameEl) {
                nameEl.textContent = 'Ready to save: ' + file.name;
                bar.style.display = 'flex';
            } else if (bar) {
                bar.style.display = 'none';
            }
        };

        window.clearMyselfPendingFile = function () {
            pendingMyselfFile = null;
            document.querySelectorAll('#msAttachPanel input[type="file"]').forEach(inp => { inp.value = ''; });
            const bar = document.getElementById('msPendingFileBar');
            if (bar) bar.style.display = 'none';
        };

        window.openMyselfPage = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) {
                window.location.href = '/login?type=personal&register=true';
                return;
            }
            const overlay = document.getElementById('myselfOverlay');
            const bodyEl = document.getElementById('msChatBody');
            const nameEl = document.getElementById('msHeaderName');
            if (!overlay || !bodyEl) return;

            if (nameEl) nameEl.textContent = 'Myself (' + (identity.username || 'Private') + ')';
            window.clearMyselfPendingFile();
            window.closeMyselfComposer();
            const barInput = document.getElementById('msMessageInput');
            const panelInput = document.getElementById('msPanelTextInput');
            if (barInput) barInput.value = '';
            if (panelInput) panelInput.value = '';

            overlay.style.display = 'flex';
            bodyEl.innerHTML = '<div style="text-align:center;color:#888;font-size:12px;margin-top:12px;">Loading your saved items...</div>';

            try {
                const url = '/api/myself?viewer_id=' + encodeURIComponent(identity.id) + '&account_type=' + encodeURIComponent(identity.accountType || 'personal');
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                const json = await res.json();
                bodyEl.innerHTML = '';
                const items = (res.ok && json?.success && Array.isArray(json.data)) ? json.data : [];
                if (items.length === 0) {
                    bodyEl.innerHTML = '<div style="text-align:center;color:#888;font-size:13px;padding:16px;">Tap the message bar below to add text, image, video, audio, or file.</div>';
                } else {
                    items.forEach(item => appendMyselfItemToDom(bodyEl, item));
                }
                bodyEl.scrollTop = bodyEl.scrollHeight;
            } catch {
                bodyEl.innerHTML = '';
            }
        };

        window.closeMyselfPage = function () {
            const panelEl = document.getElementById('msAttachPanel');
            if (panelEl && panelEl.style.display !== 'none') {
                window.closeMyselfComposer();
                return;
            }
            const overlay = document.getElementById('myselfOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.sendMyselfItem = async function () {
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return;
            const barInput = document.getElementById('msMessageInput');
            const panelInput = document.getElementById('msPanelTextInput');
            const sendBtn = document.getElementById('msSendBtn');
            const bodyEl = document.getElementById('msChatBody');

            const text = ((panelInput?.value || '') || (barInput?.value || '')).trim();
            const file = pendingMyselfFile;
            if (!text && !file) {
                window.closeMyselfComposer();
                return;
            }

            if (sendBtn) sendBtn.disabled = true;
            try {
                let res;
                if (file) {
                    const fd = new FormData();
                    fd.append('owner_id', identity.id);
                    fd.append('account_type', identity.accountType || 'personal');
                    fd.append('content', text);
                    fd.append('file', file);
                    res = await fetch('/api/myself', {
                        method: 'POST',
                        credentials: 'include',
                        body: fd
                    });
                } else {
                    res = await fetch('/api/myself', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            owner_id: identity.id,
                            account_type: identity.accountType || 'personal',
                            content: text
                        })
                    });
                }

                const json = await res.json();
                if (res.ok && json?.success && json.data) {
                    if (barInput) barInput.value = '';
                    if (panelInput) panelInput.value = '';
                    window.clearMyselfPendingFile();
                    window.closeMyselfComposer();
                    const emptyHint = bodyEl?.querySelector('div[style*="Tap the message bar"]');
                    if (emptyHint) emptyHint.remove();
                    appendMyselfItemToDom(bodyEl, json.data);
                    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
                }
            } catch {} finally {
                if (sendBtn) sendBtn.disabled = false;
            }
        };

        window.deleteMyselfItem = async function (itemId, btnEl) {
            if (!itemId) return;
            const identity = getActiveAccountIdentity();
            if (!identity || !identity.id) return;
            try {
                const res = await fetch('/api/myself?id=' + encodeURIComponent(itemId) + '&viewer_id=' + encodeURIComponent(identity.id), {
                    method: 'DELETE',
                    credentials: 'include'
                });
                if (res.ok) {
                    btnEl?.closest('.nc-message')?.remove();
                }
            } catch {}
        };


        /* === AUTHOR PROFILE PAGE ON POST AVATAR CLICK === */
        function normalizeAuthorToken(val) {
            return String(val || '').replace(/^(?:♾️|♾|∞|@)+/gu, '').trim().toLowerCase();
        }

        window.switchAuthorProfileTab = function (tab, btnEl) {
            const infoSec = document.getElementById('apInfoSection');
            const feedSec = document.getElementById('apFeedSection');
            const tabInfo = document.getElementById('apTabInfo');
            const tabFeed = document.getElementById('apTabFeed');
            if (tabInfo) tabInfo.classList.toggle('active', tab === 'info');
            if (tabFeed) tabFeed.classList.toggle('active', tab === 'feed');
            if (infoSec) infoSec.style.display = tab === 'info' ? 'block' : 'none';
            if (feedSec) feedSec.style.display = tab === 'feed' ? 'block' : 'none';
        };

        window.openReadOnlyWorkerProfile = function (authorId) {
            const workerProfileFrame = document.getElementById('workerProfileFrame');
            const srcEl = document.getElementById('workerProfileDocumentSource');
            const overlay = document.getElementById('workerProfileOverlay');
            if (!workerProfileFrame || !srcEl || !overlay) return;
            const rawHtml = srcEl.content.textContent || '';
            if (!rawHtml) return;

            const readonlyScript = `<style>
.header-image-btn, .header-ellipse-btn, .section-edit, .edit-btn, .upload-btn, input[type="file"] {
  display: none !important;
}
</style>
<script>
(function(){
  const targetUid = ${JSON.stringify(String(authorId || ''))};
  window.__INFINITY_READONLY_WORKER__ = true;
  window.__INFINITY_READONLY_TARGET_UID__ = targetUid;
  try {
    const origGetItem = Storage.prototype.getItem;
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function(k) {
      if (String(k || '').toLowerCase().includes('worker')) return null;
      return origGetItem.call(this, k);
    };
    Storage.prototype.setItem = function(k, v) {
      if (String(k || '').toLowerCase().includes('worker')) return;
      return origSetItem.call(this, k, v);
    };
  } catch {}
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    try {
      window.__INFINITY_READONLY_WORKER__ = true;
      const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (urlStr.includes('/api/posts/feed') && targetUid) {
        return origFetch('/api/posts/feed?feed_type=author&author_id=' + encodeURIComponent(targetUid) + '&limit=50', init);
      }
      if ((urlStr.includes('/api/worker/profile') || urlStr.includes('/api/profile/contact') || urlStr.includes('/api/profile/avatar')) && targetUid && (!init || !init.method || init.method.toUpperCase() === 'GET')) {
        let nextUrl = urlStr;
        if (/user_id=[^&]*/.test(nextUrl)) {
          nextUrl = nextUrl.replace(/user_id=[^&]*/, 'user_id=' + encodeURIComponent(targetUid));
        } else {
          const sep = nextUrl.includes('?') ? '&' : '?';
          nextUrl = nextUrl + sep + 'user_id=' + encodeURIComponent(targetUid);
        }
        return origFetch(nextUrl, init);
      }
      if (init && init.method && ['POST','PUT','PATCH','DELETE'].includes(init.method.toUpperCase())) {
        if (urlStr.includes('/api/worker/')) {
          return Promise.resolve(new Response(JSON.stringify({ success: false, error: { message: 'Read-only view' } }), { status: 403 }));
        }
      }
    } catch {}
    return origFetch(input, init);
  };
  function enforceReadOnly() {
    document.querySelectorAll('input[type="file"], .header-image-btn, .header-ellipse-btn, .section-edit').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('button, .edit-btn, .upload-btn').forEach(el => {
      if (el.closest('.back-btn') || el.classList.contains('back-btn') || /back|close/i.test(el.getAttribute('aria-label') || '') || /closeWorkerProfilePage/i.test(el.getAttribute('onclick') || '')) return;
      const meta = (el.textContent || '') + ' ' + (el.className || '') + ' ' + (el.getAttribute('onclick') || '');
      if (/edit|save|add|upload|delete|remove|update|choose/i.test(meta)) {
        el.style.display = 'none';
      }
    });
    document.querySelectorAll('input, textarea, select').forEach(el => { el.disabled = true; el.readOnly = true; });
    document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  }
  document.addEventListener('DOMContentLoaded', () => {
    enforceReadOnly();
    setTimeout(enforceReadOnly, 400);
    setTimeout(enforceReadOnly, 1200);
  });
})();
<\/script>`;

            const patchedHtml = rawHtml.includes('<head>')
                ? rawHtml.replace('<head>', '<head>' + readonlyScript)
                : (readonlyScript + rawHtml);

            document.body.classList.add('viewing-other-profile'); const _ff = document.querySelector('.fixed-footer'); if (_ff) _ff.style.display = 'none';
            overlay.dataset.activeAuthorId = String(authorId || '');
            workerProfileFrame.dataset.readonlyMode = 'true';
            workerProfileFrame.srcdoc = patchedHtml;
            overlay.style.display = 'block';
        };

        window.openAuthorProfileFromPost = function (postCard) {
            if (!postCard) return;
            setHomeFeedFloatingActionsVisible(false);

            const h4El = postCard.querySelector('.post-author-info h4');
            const spanHandle = h4El?.querySelector('span')?.textContent || '';
            const fullH4 = String(h4El?.textContent || '').trim();
            const displayName = spanHandle ? fullH4.replace(spanHandle, '').trim() : fullH4;
            const authorId = String(postCard.dataset.authorId || postCard.dataset.userId || '').trim();
            const authorHandle = normalizeAuthorToken(postCard.dataset.authorUsername || spanHandle || displayName);
            const authorAccountType = String(postCard.dataset.authorAccountType || 'personal').toLowerCase();
            const handleLabel = spanHandle ? spanHandle.trim() : (authorHandle ? '♾️' + authorHandle : '@user');

            // 1. WORK ACCOUNT (creator) -> open exact Work Profile in read-only mode
            if (authorAccountType === 'creator' && authorId) {
                window.openReadOnlyWorkerProfile(authorId);
                return;
            }

            const overlay = document.getElementById('authorProfileOverlay');
            const nameEl = document.getElementById('apAuthorName');
            const handleEl = document.getElementById('apAuthorHandle');
            const infoNameEl = document.getElementById('apInfoName');
            const infoHandleEl = document.getElementById('apInfoHandle');
            const likesEl = document.getElementById('apLikesCount');
            const repostsEl = document.getElementById('apRepostsCount');
            const commentsEl = document.getElementById('apCommentsCount');
            const feedEl = document.getElementById('apPostsFeed');
            const tabInfoBtn = document.getElementById('apTabInfo');
            const tabFeedBtn = document.getElementById('apTabFeed');
            if (!overlay || !feedEl) return;
            overlay.dataset.activeAuthorId = authorId || '';

            if (nameEl) nameEl.innerHTML = escapeHtml(displayName || 'User') + ' <i class="fa-solid fa-circle-check verified-badge"></i>';
            if (handleEl) handleEl.textContent = handleLabel;
            const apAvatarImg = document.getElementById('apAuthorAvatarImg');
            if (apAvatarImg) {
                const cachedAvatar = String(postCard.dataset.authorAvatar || '').trim();
                if (cachedAvatar) {
                    apAvatarImg.src = cachedAvatar;
                    apAvatarImg.style.display = 'block';
                } else {
                    apAvatarImg.removeAttribute('src');
                    apAvatarImg.style.display = 'none';
                }
                if (authorId && UUID_REGEX.test(authorId)) {
                    if (typeof window.applyProfileContactToDom === 'function') {
                    window.applyProfileContactToDom({}, ['apFeedSection']);
                }
                if (authorId && UUID_REGEX.test(authorId)) {
                    fetch('/api/profile/contact?user_id=' + encodeURIComponent(authorId), { credentials: 'include', cache: 'no-store' })
                        .then(r => r.ok ? r.json() : null)
                        .then(j => {
                            if (j?.success && j.data && typeof window.applyProfileContactToDom === 'function') {
                                window.applyProfileContactToDom(j.data, ['apFeedSection']);
                            }
                        })
                        .catch(() => {});
                }
                fetch('/api/profile/avatar?user_id=' + encodeURIComponent(authorId), { credentials: 'include', cache: 'no-store' })
                        .then(r => r.ok ? r.json() : null)
                        .then(j => {
                            if (j?.success && j.data?.avatar_url) {
                                apAvatarImg.src = j.data.avatar_url;
                                apAvatarImg.style.display = 'block';
                            }
                        })
                        .catch(() => {});
                }
            }
            if (infoNameEl) infoNameEl.innerHTML = escapeHtml(displayName || 'User') + ' <i class="fa-solid fa-circle-check verified-badge"></i>';
            if (infoHandleEl) infoHandleEl.textContent = handleLabel;

            const allCards = Array.from(document.querySelectorAll('#socialFeed .social-post-card'));
            const matching = allCards.filter(card => {
                const cId = String(card.dataset.authorId || card.dataset.userId || '').trim();
                if (authorId && cId && cId === authorId) return true;
                const ch4 = card.querySelector('.post-author-info h4');
                const cSpan = ch4?.querySelector('span')?.textContent || '';
                const cFull = String(ch4?.textContent || '').trim();
                const cName = cSpan ? cFull.replace(cSpan, '').trim() : cFull;
                const cHandle = normalizeAuthorToken(card.dataset.authorUsername || cSpan || cName);
                return Boolean(authorHandle && cHandle && cHandle === authorHandle);
            });

            let totalLikes = 0;
            let totalComments = 0;
            let totalReposts = 0;
            feedEl.innerHTML = '';
            matching.forEach(card => {
                const clone = card.cloneNode(true);
                clone.style.display = 'flex';
                clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
                clone.querySelectorAll('.profile-feed-media-editor, .profile-feed-text-actions').forEach(el => el.remove());
                feedEl.appendChild(clone);

                const counts = card.querySelectorAll('.post-actions .action-btn .action-count');
                if (counts[0]) totalLikes += parseActionCount(counts[0].textContent);
                if (counts[1]) totalComments += parseActionCount(counts[1].textContent);
                if (counts[2]) totalReposts += parseActionCount(counts[2].textContent);
            });

            if (likesEl) likesEl.textContent = formatCommentCount(totalLikes);
            if (commentsEl) commentsEl.textContent = formatCommentCount(totalComments);
            if (repostsEl) repostsEl.textContent = formatCommentCount(totalReposts);
            const apSupportBtn = document.getElementById('apSupportBtn');
            if (apSupportBtn) {
                const targetAuthor = (displayName || authorHandle || '').trim();
                apSupportBtn.dataset.author = targetAuthor;
                if (typeof window.syncSupportButtonElement === 'function') {
                    window.syncSupportButtonElement(apSupportBtn);
                }
                if (typeof window.syncTargetSupportsFromDatabase === 'function') {
                    void window.syncTargetSupportsFromDatabase();
                }
            }

            // 2. BUSINESS ACCOUNT -> show INFO + FEED tabs (read-only)
            // 3. USER ACCOUNT (personal) -> show only User Profile FEED (hide INFO tab)
            const isBusiness = authorAccountType === 'business';
            if (tabInfoBtn) tabInfoBtn.style.display = isBusiness ? '' : 'none';
            if (tabFeedBtn) tabFeedBtn.style.display = isBusiness ? '' : 'none';
            const apFeedInfoSec = document.querySelector('#apFeedSection > .profile-info-section');
            if (apFeedInfoSec) apFeedInfoSec.style.display = 'none';

            const apInfoSec = document.getElementById('apInfoSection');
            const srcInfoSec = document.getElementById('userInfoSection');
            if (isBusiness && apInfoSec && srcInfoSec) {
                apInfoSec.innerHTML = '';
                apInfoSec.style.padding = '0';
                const infoClone = srcInfoSec.cloneNode(true);
                infoClone.style.display = 'block';
                infoClone.querySelectorAll('[onclick*="openBusinessEditor"], .business-profile-banner-edit-btn, .business-profile-header-edit-btn, .business-edit-btn, [data-edit-only="true"]').forEach(el => el.remove());
                infoClone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
                const cloneNameEl = infoClone.querySelector('#display-prof-name');
                const cloneTaglineEl = infoClone.querySelector('#display-prof-tagline');
                const cloneAboutEl = infoClone.querySelector('#display-prof-about');
                const cloneOwnerEl = infoClone.querySelector('#display-prof-owner');
                const cloneOrderBox = infoClone.querySelector('#order-received-box')?.closest('.business-info-card');
                if (cloneOrderBox) cloneOrderBox.remove();

                infoClone.querySelectorAll('[id]').forEach(el => {
                    el.dataset.origId = el.id;
                    el.removeAttribute('id');
                });
                if (cloneNameEl) cloneNameEl.textContent = displayName || (authorHandle ? '@' + authorHandle : 'Profile');
                if (cloneTaglineEl) cloneTaglineEl.textContent = handleLabel;
                const cloneAvatarWrap = infoClone.querySelector('.profile-feed-avatar-wrap');
                if (cloneAvatarWrap) {
                    cloneAvatarWrap.classList.add('readonly');
                    cloneAvatarWrap.removeAttribute('title');
                    cloneAvatarWrap.querySelectorAll('.profile-feed-avatar-badge, input[type="file"]').forEach(el => el.remove());
                }
                const cloneAvatarImg = infoClone.querySelector('[data-feed-avatar-img]');
                if (cloneAvatarImg) {
                    const avSrc = String(postCard.dataset.authorAvatar || '').trim();
                    if (avSrc) { cloneAvatarImg.src = avSrc; cloneAvatarImg.style.display = 'block'; }
                    else { cloneAvatarImg.removeAttribute('src'); cloneAvatarImg.style.display = 'none'; }
                }
                const cloneContactRow = infoClone.querySelector('.profile-contact-icons-row');
                if (cloneContactRow) cloneContactRow.dataset.readonly = 'true';
                const cloneSwitcher = infoClone.querySelector('.account-switcher-trigger');
                if (cloneSwitcher) {
                    const supWrap = document.createElement('div');
                    supWrap.className = 'stat-item';
                    supWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;';
                    const supBtn = document.createElement('button');
                    supBtn.type = 'button';
                    supBtn.className = 'follow-btn';
                    supBtn.textContent = '+ SUPPORT';
                    supBtn.style.cssText = 'padding:6px 12px;border-radius:16px;font-size:0.75rem;font-weight:700;cursor:pointer;';
                    supBtn.dataset.author = displayName || authorHandle || '';
                    supBtn.setAttribute('onclick', 'toggleFollow(this)');
                    supWrap.appendChild(supBtn);
                    cloneSwitcher.replaceWith(supWrap);
                    if (typeof window.syncSupportButtonElement === 'function') {
                        window.syncSupportButtonElement(supBtn);
                    }
                }
                if (cloneAboutEl) cloneAboutEl.textContent = 'No business description added yet.';
                if (cloneOwnerEl) cloneOwnerEl.textContent = 'No owner details added yet.';

                // Wire Home / Staff / Info footer tabs inside cloned INFO view
                const homeContent = infoClone.querySelector('.business-profile-content-body');
                const staffSec = infoClone.querySelector('[data-orig-id="businessStaffSection"]');
                let allItemsSec = infoClone.querySelector('[data-orig-id="businessAllItemsSection"]');
                if (!allItemsSec && homeContent) {
                    allItemsSec = document.createElement('div');
                    allItemsSec.dataset.origId = 'businessAllItemsSection';
                    allItemsSec.style.display = 'none';
                    homeContent.appendChild(allItemsSec);
                }
                const btnHome = infoClone.querySelector('[data-orig-id="btn-business-home"]');
                const btnStaff = infoClone.querySelector('[data-orig-id="btn-business-staff"]');
                const btnInfo = infoClone.querySelector('[data-orig-id="btn-business-info"]');

                const switchClonedBizTab = (tabName) => {
                    [btnHome, btnStaff, btnInfo].forEach(b => { if (b) b.classList.remove('active'); });
                    if (homeContent) {
                        homeContent.querySelectorAll('.business-info-card').forEach(c => {
                            c.style.display = tabName === 'home' ? 'block' : 'none';
                        });
                    }
                    if (staffSec) staffSec.style.display = tabName === 'staff' ? 'block' : 'none';
                    if (allItemsSec) allItemsSec.style.display = tabName === 'info' ? 'block' : 'none';
                    if (tabName === 'home' && btnHome) btnHome.classList.add('active');
                    if (tabName === 'staff' && btnStaff) btnStaff.classList.add('active');
                    if (tabName === 'info' && btnInfo) btnInfo.classList.add('active');
                    const apInfoEl = document.getElementById('apInfoSection');
                    if (apInfoEl) apInfoEl.scrollTop = 0;
                };

                [btnHome, btnStaff, btnInfo].forEach(b => { if (b) b.removeAttribute('onclick'); });
                if (btnHome) btnHome.addEventListener('click', () => switchClonedBizTab('home'));
                if (btnStaff) btnStaff.addEventListener('click', () => switchClonedBizTab('staff'));
                if (btnInfo) btnInfo.addEventListener('click', () => { openAllInfoHub({ userId: authorId, readonly: true }); });

                apInfoSec.appendChild(infoClone);

                // Reset cloned sections before populating from DB for this specific author
                const rstList = infoClone.querySelector('[data-orig-id="listings-display"]');
                const rstDeliv = infoClone.querySelector('[data-orig-id="delivery-display"]');
                const rstSoc = infoClone.querySelector('[data-orig-id="social-display"]');
                const rstRev = infoClone.querySelector('[data-orig-id="reviews-display"]');
                const rstStaff = infoClone.querySelector('[data-orig-id="staff-roles-container"]');
                if (rstList) rstList.innerHTML = '<div style="color:#888;font-size:12px;">No listings added.</div>';
                if (rstDeliv) rstDeliv.innerHTML = '<div style="color:#888;font-size:12px;">No delivery locations added.</div>';
                if (rstSoc) rstSoc.innerHTML = '<div style="color:#888;font-size:12px;">No social links added.</div>';
                if (rstRev) rstRev.innerHTML = '';
                if (rstStaff) rstStaff.innerHTML = '<div style="color:#888;font-size:12px;">No staff roles added.</div>';

                if (authorId && UUID_REGEX.test(authorId)) {
                    Promise.all([
                        fetch('/api/business/profile?user_id=' + encodeURIComponent(authorId), { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
                        fetch('/api/business/catalog?user_id=' + encodeURIComponent(authorId), { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
                    ]).then(([profJson, catJson]) => {
                        const prof = profJson?.success ? profJson.data : null;
                        if (prof) {
                            const nEl = infoClone.querySelector('[data-orig-id="display-prof-name"]');
                            const tEl = infoClone.querySelector('[data-orig-id="display-prof-tagline"]');
                            const bEl = infoClone.querySelector('[data-orig-id="display-profile-banner-img"]');
                            const aEl = infoClone.querySelector('[data-orig-id="display-prof-about"]');
                            const oEl = infoClone.querySelector('[data-orig-id="display-prof-owner"]');
                            const hrsEl = infoClone.querySelector('[data-orig-id="display-prof-hours"]');
                            if (nEl && prof.business_name) nEl.textContent = prof.business_name;
                            if (tEl && prof.tagline) tEl.textContent = prof.tagline;
                            if (bEl && prof.banner_url) bEl.src = prof.banner_url;
                            if (aEl && prof.about_business) aEl.textContent = prof.about_business;
                            if (oEl && prof.about_owner) oEl.textContent = prof.about_owner;
                            const phEl = infoClone.querySelector('[data-orig-id="display-prof-phone"]');
                            const locEl = infoClone.querySelector('[data-orig-id="display-prof-location"]');
                            const mailEl = infoClone.querySelector('[data-orig-id="display-prof-mail"]');
                            if (phEl) phEl.textContent = prof.phone_number || 'Not provided';
                            if (locEl) locEl.textContent = prof.location || 'Not provided';
                            if (mailEl) mailEl.textContent = prof.mail || 'Not provided';
                            const cP = infoClone.querySelector('[data-contact-kind="phone"]');
                            const cE = infoClone.querySelector('[data-contact-kind="email"]');
                            const cL = infoClone.querySelector('[data-contact-kind="location"]');
                            if (cP && !cP.dataset.contactValue && prof.phone_number) { cP.dataset.contactValue = prof.phone_number; cP.classList.remove('empty-readonly'); }
                            if (cE && !cE.dataset.contactValue && prof.mail) { cE.dataset.contactValue = prof.mail; cE.classList.remove('empty-readonly'); }
                            if (cL && !cL.dataset.contactValue && prof.location) { cL.dataset.contactValue = prof.location; cL.classList.remove('empty-readonly'); }
                            if (hrsEl && (prof.working_hours_weekday || prof.working_hours_sunday)) {
                                hrsEl.innerHTML = '<b style="color:#fff;">Monday – Saturday:</b> ' + escapeHtml(prof.working_hours_weekday || '8:00 AM – 9:00 PM') + '<br><b style="color:#fff;">Sunday:</b> ' + escapeHtml(prof.working_hours_sunday || '9:00 AM – 2:00 PM');
                            }
                            if (rstList && Array.isArray(prof.listings) && prof.listings.length > 0) {
                                rstList.innerHTML = prof.listings.map(l => '<a href="' + escapeHtml(l.url || '#') + '" target="_blank" rel="noopener noreferrer" class="business-listing-chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:#161b22;border:1px solid #2b323b;color:#39e8f4;text-decoration:none;font-size:12px;margin:4px 4px 0 0;">' + escapeHtml(l.name || l.url || 'Link') + '</a>').join('');
                            }
                            if (rstDeliv && Array.isArray(prof.delivery_places) && prof.delivery_places.length > 0) {
                                rstDeliv.innerHTML = prof.delivery_places.map(p => '<span style="display:inline-block;padding:5px 10px;border-radius:14px;background:#161b22;border:1px solid #2b323b;color:#e9edef;font-size:12px;margin:4px 4px 0 0;">' + escapeHtml(p) + '</span>').join('');
                            }
                            if (rstSoc && Array.isArray(prof.social_links) && prof.social_links.length > 0) {
                                rstSoc.innerHTML = prof.social_links.map(s => '<a href="' + escapeHtml(s.url || '#') + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:#161b22;border:1px solid #2b323b;color:#00ff66;text-decoration:none;font-size:12px;margin:4px 4px 0 0;">' + escapeHtml(s.name || s.url || 'Link') + '</a>').join('');
                            }
                            if (rstStaff && Array.isArray(prof.staff_roles) && prof.staff_roles.length > 0) {
                                rstStaff.innerHTML = prof.staff_roles.map(st => '<div class="business-staff-role-card"><div class="business-staff-avatar">' + escapeHtml((String(st.name || 'S').charAt(0) || 'S').toUpperCase()) + '</div><div class="business-staff-info"><div class="business-staff-name">' + escapeHtml(st.name || '') + '</div><div class="business-staff-role-title">' + escapeHtml(st.role || '') + '</div></div><div class="business-staff-actions"><span class="business-staff-count-badge">' + escapeHtml(st.count || '1') + '</span></div></div>').join('');
                            }
                            if (rstRev && Array.isArray(prof.reviews) && prof.reviews.length > 0) {
                                rstRev.innerHTML = prof.reviews.map(rv => '<div style="padding:8px 0;border-bottom:1px solid #22262c;"><strong style="color:#fff;font-size:13px;">' + escapeHtml(rv.name || 'Customer') + '</strong><div style="color:#ccc;font-size:12px;margin-top:2px;">' + escapeHtml(rv.text || '') + '</div></div>').join('');
                            }
                        }
                        const catItems = (catJson?.success && Array.isArray(catJson.data)) ? catJson.data : [];
                        if (allItemsSec) {
                            allItemsSec.innerHTML = catItems.length > 0
                                ? ('<div style="padding:4px 0;"><div style="font-size:13px;font-weight:700;color:#00f0ff;margin-bottom:10px;">Products, Services &amp; Vacancies (' + catItems.length + ')</div>' +
                                   '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">' +
                                   catItems.map(it => '<div style="background:#161920;border:1px solid #2a2f3a;border-radius:10px;overflow:hidden;"><img src="' + escapeHtml(it.image_url || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=500&q=80') + '" alt="" style="width:100%;height:90px;object-fit:cover;"><div style="padding:8px;"><div style="font-size:10px;color:#00f0ff;text-transform:uppercase;">' + escapeHtml(it.item_type || '') + '</div><div style="font-size:12px;font-weight:700;color:#fff;margin-top:2px;">' + escapeHtml(it.title || '') + '</div><div style="font-size:11px;color:#aaa;margin-top:2px;">' + escapeHtml(it.subtitle || '') + '</div></div></div>').join('') +
                                   '</div></div>')
                                : '<div style="padding:24px 12px;text-align:center;color:#888;font-size:13px;">No products, services, or vacancies added yet.</div>';
                        }
                    });
                }
            } else if (apInfoSec) {
                apInfoSec.innerHTML = '';
            }

            window.switchAuthorProfileTab('feed');
            overlay.querySelectorAll('.profile-tab-btn').forEach((b, i) => {
                b.classList.toggle('active', i === 0);
            });

            if (authorId && UUID_REGEX.test(authorId)) {
                fetch('/api/posts/feed?feed_type=author&author_id=' + encodeURIComponent(authorId) + '&limit=50', { credentials: 'include', cache: 'no-store' })
                    .then(r => r.ok ? r.json() : null)
                    .then(j => {
                        if (!j?.success || !Array.isArray(j.data) || j.data.length === 0) return;
                        let dbLikes = 0, dbComments = 0, dbReposts = 0;
                        feedEl.innerHTML = '';
                        j.data.forEach(p => {
                            const c = buildDbPostCard(p);
                            c.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
                            feedEl.appendChild(c);
                            dbLikes += Number(p.like_count || 0);
                            dbComments += Number(p.comment_count || 0);
                            dbReposts += Number(p.repost_count || 0);
                        });
                        if (likesEl) likesEl.textContent = formatCommentCount(dbLikes);
                        if (commentsEl) commentsEl.textContent = formatCommentCount(dbComments);
                        if (repostsEl) repostsEl.textContent = formatCommentCount(dbReposts);
                    })
                    .catch(() => {});
            }

            overlay.style.display = 'flex';
            overlay.scrollTop = 0;
        };

        window.closeAuthorProfilePage = function () {
            const overlay = document.getElementById('authorProfileOverlay');
            if (overlay) overlay.style.display = 'none';
            document.body.classList.remove('viewing-other-profile'); const _ff = document.querySelector('.fixed-footer'); if (_ff) _ff.style.display = 'flex';
            const homeBtn = document.querySelectorAll('.fixed-footer .footer-item')[2];
            if (homeBtn && homeBtn.classList.contains('active')) {
                setHomeFeedFloatingActionsVisible(true);
            }
        };

        window.filterAuthorProfileTab = function (type, btnEl) {
            const overlay = document.getElementById('authorProfileOverlay');
            const feedEl = document.getElementById('apPostsFeed');
            if (!overlay || !feedEl) return;
            overlay.querySelectorAll('.profile-tab-btn').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
            feedEl.querySelectorAll('.social-post-card').forEach(card => {
                const t = card.dataset.type || 'text';
                card.style.display = (type === 'all' || t === type) ? 'flex' : 'none';
            });
        };

        window.closeFloatingUserProfileHeader = function () {
            const modal = document.getElementById('userProfileHeaderModal');
            if (modal) modal.style.display = 'none';
        };

        window.openFloatingUserProfileHeader = function (mode) {
            const modal = document.getElementById('userProfileHeaderModal');
            const body = document.getElementById('userProfileHeaderModalBody');
            if (!modal || !body) return;
            const srcSection = mode === 'visitor'
                ? document.querySelector('#visitorActivitySection .profile-info-section')
                : document.querySelector('#apFeedSection > .profile-info-section');
            if (!srcSection) return;
            body.innerHTML = '';
            const clone = srcSection.cloneNode(true);
            clone.style.display = 'block';
            clone.style.padding = '0';
            clone.querySelectorAll('[id]').forEach(el => {
                el.dataset.origId = el.id;
                el.removeAttribute('id');
            });
            if (mode === 'visitor') {
                const fileInput = clone.querySelector('input[type="file"]');
                if (fileInput) {
                    fileInput.setAttribute('onchange', 'window.handleProfileFeedAvatarUpload(this)');
                }
                clone.querySelectorAll('[data-contact-kind]').forEach(btn => {
                    const kind = btn.dataset.contactKind;
                    btn.onclick = () => {
                        window.closeFloatingUserProfileHeader();
                        const origBtn = srcSection.querySelector('[data-contact-kind="' + kind + '"]');
                        window.handleProfileContactIconClick(kind, origBtn || btn);
                    };
                });
            }
            const supBtn = clone.querySelector('.follow-btn');
            if (supBtn && typeof window.syncSupportButtonElement === 'function') {
                window.syncSupportButtonElement(supBtn);
            }
            body.appendChild(clone);
            modal.style.display = 'flex';
        };

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const postAvatar = target.closest('.social-post-card .post-avatar');
            if (postAvatar && target.closest('#visitorFeed')) {
                e.stopPropagation();
                window.openFloatingUserProfileHeader('visitor');
                return;
            }
            if (postAvatar && target.closest('#apPostsFeed')) {
                e.stopPropagation();
                window.openFloatingUserProfileHeader('author');
                return;
            }
            const avatarOrAuthor = target.closest('.social-post-card .post-avatar, .social-post-card .post-author-info');
            if (!avatarOrAuthor) return;
            if (target.closest('#authorProfileOverlay') || target.closest('#messageFloaterFeed')) return;
            const card = avatarOrAuthor.closest('.social-post-card');
            if (card) {
                e.stopPropagation();
                window.openAuthorProfileFromPost(card);
            }
        });

        /* === SHARE TO ACCOUNTS PAGE (FROM SHARE TO ALL) === */
        let selectedShareAccounts = new Map();
        let shareAccountsTimer = null;

        function highlightSharePrefix(text, query) {
            const safeText = escapeHtml(text || '');
            const q = String(query || '').trim().replace(/^@+/, '');
            if (!q) return safeText;
            const idx = String(text || '').toLowerCase().indexOf(q.toLowerCase());
            if (idx === -1) return safeText;
            return escapeHtml(text.slice(0, idx)) +
                '<span style="color:#00a884;font-weight:700;">' + escapeHtml(text.slice(idx, idx + q.length)) + '</span>' +
                escapeHtml(text.slice(idx + q.length));
        }

        async function loadShareAccountsResults(query) {
            const listEl = document.getElementById('saAccountsList');
            if (!listEl) return;
            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            try {
                const url = '/api/teams/search-users?q=' + encodeURIComponent(query || '') +
                    (identity?.id ? ('&viewer_id=' + encodeURIComponent(identity.id)) : '');
                const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
                const json = await res.json();
                const users = (res.ok && json?.success && Array.isArray(json.data)) ? json.data : [];
                if (users.length === 0) {
                    listEl.innerHTML = '<div style="padding:18px 16px; color:#888; font-size:13px;">No accounts found.</div>';
                    return;
                }
                listEl.innerHTML = '';
                users.forEach(u => {
                    const isSelected = selectedShareAccounts.has(u.id);
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:11px 16px; border-bottom:1px solid #1d2024; cursor:pointer;';
                    const avatar = u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
                    row.innerHTML =
                        '<div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">' +
                            '<img src="' + escapeHtml(avatar) + '" alt="" style="width:42px; height:42px; border-radius:50%; object-fit:cover; background:#2a2d32; flex-shrink:0;" />' +
                            '<div style="min-width:0;">' +
                                '<div style="font-size:15px; color:#e9edef; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + highlightSharePrefix(u.username || u.display_name, query) + '</div>' +
                                '<div style="font-size:12px; color:#8696a0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(u.display_name || '') + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div style="width:22px; height:22px; border-radius:50%; border:2px solid ' + (isSelected ? '#00a884' : '#667781') + '; background:' + (isSelected ? '#00a884' : 'transparent') + '; display:flex; align-items:center; justify-content:center; color:#111b21; font-size:12px; font-weight:700; flex-shrink:0;">' + (isSelected ? '✓' : '') + '</div>';
                    row.onclick = () => {
                        if (selectedShareAccounts.has(u.id)) {
                            selectedShareAccounts.delete(u.id);
                        } else {
                            selectedShareAccounts.set(u.id, u);
                        }
                        loadShareAccountsResults(document.getElementById('saSearchInput')?.value || '');
                    };
                    listEl.appendChild(row);
                });
            } catch {
                listEl.innerHTML = '<div style="padding:18px 16px; color:#888; font-size:13px;">Failed to load accounts.</div>';
            }
        }

        window.openShareToAccountsPage = function () {
            if (!requireRegistrationForPostAction()) return;
            closeShareModal();
            const overlay = document.getElementById('shareAccountsOverlay');
            const input = document.getElementById('saSearchInput');
            if (!overlay) return;
            selectedShareAccounts.clear();
            if (input) input.value = '';
            overlay.style.display = 'flex';
            overlay.scrollTop = 0;
            loadShareAccountsResults('');
            if (input) input.focus();
        };

        window.closeShareToAccountsPage = function () {
            const overlay = document.getElementById('shareAccountsOverlay');
            if (overlay) overlay.style.display = 'none';
        };

        window.onShareAccountsSearchInput = function (val) {
            if (shareAccountsTimer) clearTimeout(shareAccountsTimer);
            shareAccountsTimer = setTimeout(() => {
                loadShareAccountsResults(val);
            }, 120);
        };

        window.clearShareAccountsSearch = function () {
            const input = document.getElementById('saSearchInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            loadShareAccountsResults('');
        };

        window.submitShareToAccounts = async function () {
            if (selectedShareAccounts.size === 0) {
                alert('Please select at least 1 account to share.');
                return;
            }
            const identity = typeof getActiveAccountIdentity === 'function' ? getActiveAccountIdentity() : null;
            if (!identity || !identity.id) return;

            const btn = document.getElementById('saSendBtn');
            if (btn) btn.disabled = true;

            const postCard = activeShareButton?.closest('.social-post-card');
            const author = (postCard?.querySelector('.post-author-info h4')?.textContent || 'Post').trim();
            const text = (postCard?.querySelector('.post-text')?.textContent || '').trim();
            const mediaSrc = postCard?.querySelector('.post-media-container img')?.src ||
                postCard?.querySelector('.post-media-container video')?.src ||
                postCard?.querySelector('.post-media-container audio')?.src ||
                postCard?.querySelector('.post-media-container a[href]')?.href || '';

            const shareMessage = ['Shared post from ' + author, text, mediaSrc].filter(Boolean).join('\n');

            try {
                await Promise.all(
                    Array.from(selectedShareAccounts.keys()).map(peerId =>
                        fetch('/api/direct-messages/' + encodeURIComponent(peerId), {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: shareMessage, sender_id: identity.id })
                        })
                    )
                );
                selectedShareAccounts.clear();
                window.closeShareToAccountsPage();
                alert('Shared to selected accounts!');
            } catch {
                alert('Failed to share to some accounts.');
            } finally {
                if (btn) btn.disabled = false;
            }
        };

        /* === BROWSER & MOBILE BACK/FORWARD HISTORY NAVIGATION === */
        (function initAppHistoryNavigation() {
            if (typeof window === 'undefined' || !window.history || typeof window.history.pushState !== 'function') return;

            const TRACKED_IDS = [
                'socialMediaPage',
                'marketMatrixPage',
                'jobsMatrixPage',
                'visitorFeedPage',
                'messageFloaterPage',
                'socialFeed',
                'userProfilePage',
                'personalProfilePage',
                'userFeedSection',
                'userActivitySection',
                'businessProfilePage',
                'softwareSection',
                'edutechSection',
                'spaceCategoryHeader',
                'imageHeaderIcon',
                'videoHeaderIcon',
                'userMenuOverlay',
                'workerProfileOverlay',
                'allInfoHubOverlay',
                'all-info-item-detail-page',
                'all-info-add-modal',
                'productHubOverlay',
                'product-item-detail-page',
                'product-add-modal',
                'serviceHubOverlay',
                'service-item-detail-page',
                'service-add-modal',
                'vacancyHubOverlay',
                'vacancy-item-detail-page',
                'vacancy-add-modal',
                'joinNetworkOverlay',
                'networkChatOverlay',
                'buildTeamsOverlay',
                'joinTeamsOverlay',
                'teamChatOverlay',
                'individualOverlay',
                'individualChatOverlay',
                'myselfOverlay',
                'fullScreenViewer',
                'postCommentsOverlay',
                'postCreatorModal',
                'shareModalOverlay',
                'businessEditModal'
            ];

            let navRestoring = false;
            let lastPushedSig = '';

            function captureUiSnapshot() {
                const displays = {};
                TRACKED_IDS.forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) displays[id] = el.style.display || '';
                });

                const footerItems = Array.from(document.querySelectorAll('.fixed-footer .footer-item'));
                const footerActiveIdx = footerItems.findIndex((item) => item.classList.contains('active'));
                const mainHeader = document.getElementById('mainHeader');
                const fixedFooter = document.querySelector('.fixed-footer');
                const socialFeed = document.getElementById('socialFeed');
                const spaceTitleEl = document.getElementById('spaceCategoryTitle');
                const fabEl = document.querySelector('.create-post-fab');

                return {
                    displays,
                    isMarketOpen: Boolean(typeof isMarketOpen !== 'undefined' ? isMarketOpen : false),
                    isJobsOpen: Boolean(typeof isJobsOpen !== 'undefined' ? isJobsOpen : false),
                    activeView: typeof activeView !== 'undefined' ? activeView : 'home',
                    footerActiveIdx,
                    headerHidden: Boolean(mainHeader && mainHeader.classList.contains('hidden')),
                    footerDisplay: fixedFooter ? (fixedFooter.style.display || '') : '',
                    socialFeedMatrix: Boolean(socialFeed && socialFeed.classList.contains('matrix-grid')),
                    socialFeedPostsDisplay: socialFeed
                        ? Array.from(socialFeed.querySelectorAll('.social-post-card')).map((p) => p.style.display || '')
                        : [],
                    spaceTitle: spaceTitleEl ? spaceTitleEl.textContent : '',
                    homeFabDisplay: fabEl ? (fabEl.style.display || '') : '',
                    scrollY: window.scrollY || 0
                };
            }

            function snapshotSignature(snap) {
                return JSON.stringify({
                    d: snap.displays,
                    m: snap.isMarketOpen,
                    j: snap.isJobsOpen,
                    v: snap.activeView,
                    f: snap.footerActiveIdx,
                    h: snap.headerHidden,
                    g: snap.socialFeedMatrix,
                    s: snap.spaceTitle,
                    p: snap.socialFeedPostsDisplay
                });
            }

            function restoreUiSnapshot(snap) {
                if (!snap || typeof snap !== 'object') return;
                navRestoring = true;
                try {
                    if (typeof window.closeNetworkAccountSwitcher === 'function') window.closeNetworkAccountSwitcher();
                    if (typeof window.closeNetworkRecipientMenu === 'function') window.closeNetworkRecipientMenu();

                    TRACKED_IDS.forEach((id) => {
                        const el = document.getElementById(id);
                        if (el && Object.prototype.hasOwnProperty.call(snap.displays, id)) {
                            el.style.display = snap.displays[id];
                        }
                    });

                    const apEl = document.getElementById('authorProfileOverlay');
                    const wpEl = document.getElementById('workerProfileOverlay');
                    const isViewingOther = Boolean(
                        (apEl && apEl.style.display && apEl.style.display !== 'none') ||
                        (wpEl && wpEl.style.display && wpEl.style.display !== 'none' && document.getElementById('workerProfileFrame')?.dataset?.readonlyMode === 'true')
                    );
                    document.body.classList.toggle('viewing-other-profile', isViewingOther);
                    if (typeof isMarketOpen !== 'undefined') isMarketOpen = Boolean(snap.isMarketOpen);
                    if (typeof isJobsOpen !== 'undefined') isJobsOpen = Boolean(snap.isJobsOpen);
                    if (typeof activeView !== 'undefined') activeView = snap.activeView || 'home';

                    const mainHeader = document.getElementById('mainHeader');
                    if (mainHeader) mainHeader.classList.toggle('hidden', Boolean(snap.headerHidden));

                    const fixedFooter = document.querySelector('.fixed-footer');
                    if (fixedFooter) fixedFooter.style.display = snap.footerDisplay || 'flex';

                    const footerItems = Array.from(document.querySelectorAll('.fixed-footer .footer-item'));
                    footerItems.forEach((item, idx) => item.classList.toggle('active', idx === snap.footerActiveIdx));

                    const socialFeed = document.getElementById('socialFeed');
                    if (socialFeed) {
                        socialFeed.classList.toggle('matrix-grid', Boolean(snap.socialFeedMatrix));
                        const posts = Array.from(socialFeed.querySelectorAll('.social-post-card'));
                        if (Array.isArray(snap.socialFeedPostsDisplay) && snap.socialFeedPostsDisplay.length === posts.length) {
                            posts.forEach((p, idx) => { p.style.display = snap.socialFeedPostsDisplay[idx]; });
                        }
                    }

                    const spaceTitleEl = document.getElementById('spaceCategoryTitle');
                    if (spaceTitleEl && typeof snap.spaceTitle === 'string') {
                        spaceTitleEl.textContent = snap.spaceTitle;
                    }

                    if (typeof setHomeFeedFloatingActionsVisible === 'function') {
                        setHomeFeedFloatingActionsVisible(snap.homeFabDisplay === 'flex');
                    }

                    lastPushedSig = snapshotSignature(snap);
                    window.scrollTo(0, Number(snap.scrollY || 0));
                } finally {
                    navRestoring = false;
                }
            }

            function pushAppHistoryStep() {
                if (navRestoring) return;
                const snap = captureUiSnapshot();
                const sig = snapshotSignature(snap);
                if (sig === lastPushedSig) return;
                lastPushedSig = sig;
                try {
                    window.history.pushState({ __infinityNav: true, snap }, '');
                } catch {}
            }

            function wrapNavFn(fnName) {
                const orig = window[fnName];
                if (typeof orig !== 'function' || orig.__navWrapped) return;
                const wrapped = function (...args) {
                    const res = orig.apply(this, args);
                    if (!navRestoring) {
                        setTimeout(pushAppHistoryStep, 0);
                        if (res && typeof res.then === 'function') {
                            res.then(() => { setTimeout(pushAppHistoryStep, 0); }).catch(() => {});
                        }
                    }
                    return res;
                };
                wrapped.__navWrapped = true;
                window[fnName] = wrapped;
            }

            const NAV_FUNCTIONS = [
                'filterFeed',
                'filterJobsFeed',
                'toggleMarketPage',
                'toggleJobsPage',
                'openJobsCategory',
                'openSupportivesFeed',
                'openTrendingFeed',
                'openMarketCategory',
                'openProductHub',
                'openItemDetails',
                'openEditCardModal',
                'openServiceHub',
                'openServiceItemDetails',
                'openServiceEditCardModal',
                'openVacancyHub',
                'openVacancyItemDetails',
                'openVacancyEditCardModal',
                'openAllInfoHub',
                'openAllInfoItemDetails',
                'openAllInfoEditCardModal',
                'openJoinNetworkPage',
                'openNetworkChatPage',
                'openAuthorProfileFromPost',
                'openShareToAccountsPage',
                'openBuildTeamsPage',
                'openJoinTeamsPage',
                'openTeamChatPage',
                'openIndividualPage',
                'openIndividualChat',
                'openMyselfPage',
                'openUserMenuOverlay',
                'openWorkerProfilePage',
                'openVisitorFeedPage',
                'openMessageFloaterPage',
                'selectUserMenuOption',
                'openMyProfileFromMenu',
                'openTargetAccountPage',
                'openFullScreenViewer',
                'openPostComments',
                'openPostCreatorModal',
                'openShareModal',
                'openBusinessEditor'
            ];

            function initBaselineAndWrappers() {
                NAV_FUNCTIONS.forEach(wrapNavFn);
                const initialSnap = captureUiSnapshot();
                lastPushedSig = snapshotSignature(initialSnap);
                try {
                    if (!window.history.state || !window.history.state.__infinityNav) {
                        window.history.replaceState({ __infinityNav: true, snap: initialSnap }, '');
                    }
                } catch {}
            }

            window.addEventListener('popstate', (event) => {
                if (event.state && event.state.__infinityNav && event.state.snap) {
                    restoreUiSnapshot(event.state.snap);
                }
            });

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initBaselineAndWrappers);
            } else {
                initBaselineAndWrappers();
            }
        })();
