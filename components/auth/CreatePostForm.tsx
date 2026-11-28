"use client";
import { useState, useEffect } from "react";
import { AuthForm } from "./AuthForm";

interface UserData { user: any; profile: any; settings: any; privacy: any; session: any; }
interface CreatePostFormProps { onPostCreated?: (post: any) => void; }

export function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [content, setContent] = useState("");
  const [type, setType] = useState<"text" | "image" | "video" | "audio" | "poll">("text");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private" | "close_friends">("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try { const r = await fetch("/api/auth/me"); if (r.ok) { const d = await r.json(); if (d.success) { setUserData(d.data); return; } } } catch (e) { console.error(e); } setUserData(null);
  };

  const handleLoginSuccess = (d: UserData) => { setUserData(d); setSuccess("Logged in!"); setTimeout(() => setSuccess(""), 3000); };
  const handleLogout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUserData(null); setSuccess("Logged out!"); setTimeout(() => setSuccess(""), 3000); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setSuccess("");
    if (!content.trim()) { setError("Enter content"); return; }
    if (!userData) { setError("Please log in to post"); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, content, visibility }) });
      const d = await r.json();
      if (!r.ok) { if (r.status === 401) { setUserData(null); setError("Session expired"); return; } throw new Error(d.error?.message || "Failed"); }
      setContent(""); setSuccess("Posted!"); setTimeout(() => setSuccess(""), 3000); if (onPostCreated) onPostCreated(d.data);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  if (!userData) return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-6 text-center py-8">
      <svg className="mx-auto h-16 w-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      <h3 className="mt-4 text-xl font-semibold text-white">Sign in to post</h3>
      <p className="mt-2 text-gray-400">Log in to create posts with images, videos, or audio</p>
      {error && <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
      <div className="mt-6 max-w-md mx-auto"><AuthForm onSuccess={handleLoginSuccess} mode="login" accountType="personal" /></div>
    </div>
  );

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-400 rounded-full flex items-center justify-center font-bold text-gray-900">{userData.profile.display_name?.[0]?.toUpperCase() || "U"}</div>
          <div><p className="font-semibold text-white">{userData.profile.display_name || userData.profile.username}</p><p className="text-xs text-gray-400 capitalize">{userData.profile.account_type}</p></div>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">Logout</button>
      </div>
      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm">{success}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><textarea value={content} onChange={e => setContent(e.target.value)} placeholder={"What's on your mind?"} rows={4} className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none" maxLength={5000} /><p className="mt-1 text-right text-xs text-gray-500">{content.length}/5000</p></div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4"><label className="text-sm text-gray-300">Type:</label><select value={type} onChange={e => setType(e.target.value as any)} className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"><option value="text">Text</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option><option value="poll">Poll</option></select></div>
          <div className="flex items-center gap-4"><label className="text-sm text-gray-300">Visibility:</label><select value={visibility} onChange={e => setVisibility(e.target.value as any)} className="px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-cyan-400"><option value="public">Public</option><option value="followers">Followers</option><option value="private">Private</option><option value="close_friends">Close Friends</option></select></div>
        </div>
        <button type="submit" disabled={loading || !content.trim()} className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-medium rounded-lg disabled:opacity-50">{loading ? "Posting..." : "Post"}</button>
      </form>
    </div>
  );
}