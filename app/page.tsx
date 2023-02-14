"use client";

import React, { useState, useEffect } from "react";
import { storage } from "../pages/_app";
import { getDownloadURL, ref } from "firebase/storage";

export default function Home() {
  const [episodes, setEpisodes] = useState<any[]>([]);

  // TODO: Hook
  useEffect(() => {
    fetch("/api/episodes")
      .then((res) => res.json())
      .then((data) =>
        setEpisodes(
          data.episodes.sort((a: any, b: any) => {
            // Extract the date from the name
            const aDate = a.name.replace("-episode.mp3", "");
            const bDate = b.name.replace("-episode.mp3", "");

            // Compare the dates
            return new Date(bDate).getTime() - new Date(aDate).getTime();
          })
        )
      )
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (episodes.length > 0) {
      episodes.forEach((episode) => {
        const pathReference = ref(storage, episode.url);
        getDownloadURL(pathReference).then((url) => {
          const source = document.getElementById(
            episode.name
          ) as HTMLAudioElement;
          source.src = url;
        });
      });
    }
  }, [JSON.stringify(episodes)]);

  const generateEpisode = async () => {
    console.log("Generating episode...");
    const response = await fetch("/api/episodes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    console.log("Generated episode:", data);
  };

  // Convert an ISO date string to a human-readable date string
  // E.g. "2021-01-01T00:00:00.000Z" -> "January 1, 2021"
  // TODO: Move to a helper file
  const formatDate = (date: string): string => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  const formatTime = (date: string): string => {
    const d = new Date(date);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-500 via-blue-500 to-teal-500">
      <h1 className="text-white text-5xl font-bold mb-20">Super Wire</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-screen-lg">
        {episodes.map((file) => (
          <div
            key={file.name}
            className="rounded-lg shadow-lg overflow-hidden bg-gray-100"
          >
            <div className="h-64 flex items-center justify-center px-8">
              <div>
                <p className="text-gray-800 font-bold text-2xl">
                  {formatDate(file.name.replace("-episode.mp3", ""))}
                </p>
                <p className="text-gray-700 font-medium text-lg mt-2">
                  {formatTime(file.name.replace("-episode.mp3", ""))}
                </p>
              </div>
            </div>
            <audio id={file.name} className="w-full my-2" controls></audio>
          </div>
        ))}
      </div>

      {process.env.NODE_ENV === "development" && (
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full mt-10"
          onClick={generateEpisode}
        >
          New Episode
        </button>
      )}
    </div>
  );
}
