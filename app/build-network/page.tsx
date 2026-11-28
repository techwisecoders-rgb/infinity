"use client";

import React, { useState } from "react";
import "./build-network.css";

interface NetworkItem {
  id: number;
  name: string;
  username: string;
  description: string;
  category: string;
  image: string;
}

const CATEGORIES = [
  "General",
  "Education",
  "Business",
  "Technology",
  "News & Media",
  "Entertainment",
  "Sports",
  "Jobs & Careers",
  "Government",
  "Community",
  "Shopping",
  "Health & Fitness",
  "Others",
];

export default function BuildNetworkPage() {
  const [photoUrl, setPhotoUrl] = useState("");
  const [imageError, setImageError] = useState(false);
  const [networkName, setNetworkName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoUrl(e.target.value);
    setImageError(false);
  }

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const cleaned = e.target.value.replace(/\s/g, "");
    setUsername(cleaned);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    const trimmedName = networkName.trim();
    const trimmedUser = username.trim();
    const trimmedDesc = description.trim();
    const trimmedImage = photoUrl.trim();

    if (!trimmedName || !trimmedUser || !trimmedDesc) {
      setErrorMessage("Please fill all required fields.");
      return;
    }

    let existing: NetworkItem[] = [];
    try {
      existing = JSON.parse(localStorage.getItem("myNetworks") || "[]");
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    const normalizedUsername = trimmedUser.replace(/^@/, "").toLowerCase();
    if (
      existing.some(
        (n) =>
          String(n.username || "")
            .replace(/^@/, "")
            .toLowerCase() === normalizedUsername
      )
    ) {
      setErrorMessage("This username already exists on this browser.");
      return;
    }

    const newNetwork: NetworkItem = {
      id: Date.now(),
      name: trimmedName,
      username: `@${normalizedUsername}`,
      description: trimmedDesc,
      category,
      image: trimmedImage,
    };

    existing.push(newNetwork);
    try {
      localStorage.setItem("myNetworks", JSON.stringify(existing));
    } catch {}

    setSuccessMessage("✓ Network created successfully!");
    setPhotoUrl("");
    setImageError(false);
    setNetworkName("");
    setUsername("");
    setDescription("");
    setCategory("General");
  }

  return (
    <div className="bn-page">
      <div className="bn-container">
        <div className="bn-card">
          <form id="networkForm" onSubmit={handleSubmit}>
            <div className="bn-photo-section">
              <label htmlFor="photo" className="bn-profile" id="profilePreview">
                {photoUrl.trim() && !imageError ? (
                  <img
                    src={photoUrl.trim()}
                    alt="Network picture"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  "📢"
                )}
              </label>

              <input
                type="url"
                id="photo"
                className="bn-input"
                placeholder="Enter image URL"
                value={photoUrl}
                onChange={handlePhotoChange}
              />
            </div>

            <label className="bn-label" htmlFor="networkName">
              Network Name *
            </label>
            <input
              type="text"
              id="networkName"
              className="bn-input"
              placeholder="Enter network name"
              maxLength={60}
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              required
            />

            <label className="bn-label" htmlFor="username">
              Username *
            </label>
            <input
              type="text"
              id="username"
              className="bn-input"
              placeholder="e.g. @mynetwork"
              maxLength={30}
              value={username}
              onChange={handleUsernameChange}
              required
            />

            <label className="bn-label" htmlFor="description">
              Description *
            </label>
            <textarea
              id="description"
              className="bn-textarea"
              placeholder="Tell people what your network is about..."
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />

            <label className="bn-label" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className="bn-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button type="submit" className="bn-create-btn">
              + BUILD NETWORK
            </button>

            {errorMessage && <p className="bn-error">{errorMessage}</p>}
            {successMessage && (
              <p className="bn-success" id="successMessage">
                {successMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
