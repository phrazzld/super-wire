// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import * as cheerio from "cheerio";
import firebase from "firebase-admin";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";
import path from "path";

const credential = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_KEY || "", "base64").toString()
);

if (firebase.apps.length === 0) {
  firebase.initializeApp({
    projectId: "super-wire",
    credential: firebase.credential.cert(credential),
    storageBucket: "gs://super-wire.appspot.com/",
  });
}

const openaiConfig = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfig);

const NEWS_INTRO_PROMPT = `Consider a news reporter whose codename is Adam.
- Adam reports the important happenings of the world to his audience
- Adam does not just read headlines: he expands on them and their implications
- Adam has a charming and engaging personality
- Adam ignores frivolous and repetitive news
- Adam combines similar stories when reporting
- Adam spends more time talking about events of scientific, technological, economic, and geopolitical significance
- Adam is not very interested in sports or pop culture

Write the introduction for a new episode of Adam's news show, Super Wire, based on the following headlines. Cluster headlines into categories, rather than hopping from one headline to another without regard for the subjects being reported. Always finish the introduction with the phrase: "And now, on to the show."

HEADLINES:
"""
{HEADLINES}
"""

SUPER WIRE EPISODE INTRODUCTION:`;

const NEWS_SEGMENT_PROMPT = `Write a fresh and engaging news segment based on the following story. Do not introduce the segment, and do not write a conclusion for it. Just write the segment itself.

STORY:
"""
{STORY}
"""

NEWS SEGMENT:`;

const NEWS_CONCLUSION_PROMPT = `Write a few paragraphs for the conclusion to today's episode of Super Wire.
- The date is {DATE}
- Briefly touch on a couple of the headlines from today's episode
- Consider the broader implications of today's stories
- Touch on the darkest, most frightening elements of today's stories -- but always pull out of it with hopeful and inspiring messaging
- Always end the conclusion with the phrase: "Stay super, everyone. And see you next time: on Super Wire!"

HEADLINES:
"""
{HEADLINES}
"""

CONCLUSION:`;

const ELEVEN_VOICE_IDS = {
  ADAM: "pNInz6obpgDQGcFmaJgB",
  RACHEL: "21m00Tcm4TlvDq8ikWAM",
  /* DOMI: "AZnzlk1XvdvUeBnXmlld", */
  BELLA: "EXAVITQu4vr4xnSDxMaL",
  ANTONI: "ErXwobaYiN019PkySvjV",
  ELLI: "MF3mGyEYCl7XYWbV9V6O",
  JOSH: "TxGEqnHWrfWFTfGW9XjX",
  ARNOLD: "VR6AewLTigWG4xSOukaG",
  /* SAM: "yoZ06aMxZJJ28mfd3POQ", */
};

const TEXT_TO_SPEECH_BASE_ENDPOINT =
  "https://api.elevenlabs.io/v1/text-to-speech";

const getRandomHostEndpoint = (): string => {
  const voiceIds = Object.values(ELEVEN_VOICE_IDS);
  const randomVoiceId = voiceIds[Math.floor(Math.random() * voiceIds.length)];
  return `${TEXT_TO_SPEECH_BASE_ENDPOINT}/${randomVoiceId}`;
};

const TOP_HEADLINES_ENDPOINT = `https://newsapi.org/v2/top-headlines`;

const NEWS_SOURCES = [
  "bbc-news",
  /* "politico", */
  "financial-times",
  /* "fox-news", */
  /* "cnn", */
  /* "pbs", */
  /* "independent", */
  "ars-technica",
  "associated-press",
  "bloomberg",
  /* "axios", */
  /* "breitbart-news", */
  /* "business-insider", */
  /* "cbs-news", */
  /* "fortune", */
  /* "google-news", */
  "hacker-news",
  /* "national-geographic", */
  /* "national-review", */
  /* "nbc-news", */
  /* "new-scientist", */
  /* "newsweek", */
  "new-york-magazine",
  "reuters",
  /* "techcrunch", */
  /* "the-american-conservative", */
  /* "the-jerusalem-post", */
  /* "the-verge", */
  "the-wall-street-journal",
  /* "wired", */
];

const NEWS_PAGE_SIZE = 3;

const getTopHeadlines = async () => {
  console.log("Getting top headlines...");
  const response = await fetch(
    TOP_HEADLINES_ENDPOINT +
      `?sources=${NEWS_SOURCES.join(",")}` +
      `&pageSize=${NEWS_PAGE_SIZE}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.NEWS_API_KEY}`,
      },
    }
  );
  const json = await response.json();

  if (json.status !== "ok") {
    console.error("Error fetching top headlines", json);
    throw new Error("Error fetching top headlines");
  }

  return json.articles;
};

const getMaxTokens = (prompt: string): number => {
  const wordCount = prompt.split(" ").length;
  return 4000 - Math.round(wordCount * 1.5);
};

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

const writeIntroduction = async (headlines: any[]): Promise<string> => {
  console.log("Writing introduction...");

  let retries = 0;
  let response;

  while (retries < MAX_RETRIES) {
    try {
      const prompt = NEWS_INTRO_PROMPT.replace(
        "{HEADLINES}",
        headlines.join("\n")
      );
      const maxTokens = getMaxTokens(prompt);
      // Generate episode intro
      response = await openai.createCompletion({
        model: "text-davinci-003",
        temperature: 0.7,
        max_tokens: maxTokens,
        prompt: prompt,
      });
      break;
    } catch (error: any) {
      console.error(`Error writing intro: ${error.message}`);
      retries++;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  if (retries === MAX_RETRIES) {
    throw new Error(`Failed to write intro after ${MAX_RETRIES} retries`);
  }

  if (
    !response ||
    !response.data.choices ||
    response.data.choices.length === 0
  ) {
    throw new Error("No intro generated");
  }

  return response.data.choices[0].text || "";
};

const writeSegment = async (content: string): Promise<string> => {
  console.log("Writing segment...");

  let retries = 0;
  let response;

  while (retries < MAX_RETRIES) {
    try {
      const prompt = NEWS_SEGMENT_PROMPT.replace("{STORY}", content);
      const maxTokens = getMaxTokens(prompt);

      if (maxTokens < 100) {
        console.warn("Content too long for segment");
        return "";
      }

      response = await openai.createCompletion({
        model: "text-davinci-003",
        temperature: 0.7,
        max_tokens: maxTokens,
        prompt: prompt,
      });
      break;
    } catch (error: any) {
      console.error(`Error writing segment: ${error.message}`);
      console.error(error);
      retries++;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  if (retries === MAX_RETRIES) {
    throw new Error(`Failed to write segment after ${MAX_RETRIES} retries`);
  }

  if (
    !response ||
    !response.data.choices ||
    response.data.choices.length === 0
  ) {
    throw new Error("No intro generated");
  }

  return response.data.choices[0].text || "";
};

const writeConclusion = async (headlines: any[]): Promise<string> => {
  console.log("Writing conclusion...");

  let retries = 0;
  let response;

  while (retries < MAX_RETRIES) {
    try {
      const prompt = NEWS_CONCLUSION_PROMPT.replace(
        "{HEADLINES}",
        headlines.join("\n")
      ).replace("{DATE}", new Date().toLocaleDateString());

      const maxTokens = getMaxTokens(prompt);
      response = await openai.createCompletion({
        model: "text-davinci-003",
        temperature: 0.7,
        max_tokens: maxTokens,
        prompt: prompt,
      });
      break;
    } catch (error: any) {
      console.error(`Error writing conclusion: ${error.message}`);
      retries++;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  if (retries === MAX_RETRIES) {
    throw new Error(`Failed to write conclusion after ${MAX_RETRIES} retries`);
  }

  if (
    !response ||
    !response.data.choices ||
    response.data.choices.length === 0
  ) {
    throw new Error("No intro generated");
  }

  return response.data.choices[0].text || "";
};

type Episode = {
  intro: string;
  segments: string[];
  conclusion: string;
};

const writeEpisode = async (stories: any[]): Promise<Episode> => {
  console.log("Writing episode...");

  const headlines = stories.map(
    (story) => story.title + " :: " + story.description
  );
  const intro = await writeIntroduction(headlines);

  // TODO: Experiment with different hosts for different segments
  let segments = [];

  for (const story of stories) {
    const segment = await writeSegment(story.content);
    segments.push(segment);
  }

  // TODO: Smoother transitions between segments
  const conclusion = await writeConclusion(headlines);

  const episode = { intro, segments, conclusion };
  console.log(episode);

  return episode;
};

const EPISODES_DIR = "./public/episodes";

const recordEpisode = async (episode: Episode): Promise<void> => {
  console.log("Recording episode...");

  const { intro, segments, conclusion } = episode;

  const timestamp = new Date().toISOString();

  // TODO: Figure out intentional hosts

  // Process intro
  const introRes = await fetch(
    `${TEXT_TO_SPEECH_BASE_ENDPOINT}/${ELEVEN_VOICE_IDS.ADAM}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
      } as HeadersInit,
      body: JSON.stringify({
        text: intro,
      }),
    }
  );

  const introData = await introRes.arrayBuffer();

  // Generate filename
  let filename = `${timestamp}-00-intro.mp3`;

  fs.writeFile(`${EPISODES_DIR}/${filename}`, Buffer.from(introData), (err) => {
    if (err) throw err;
    console.log("The intro audio has been saved!");
  });

  // Process segments
  for (let i = 0; i < segments.length; i++) {
    const segmentRes = await fetch(getRandomHostEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
      } as HeadersInit,
      body: JSON.stringify({
        text: segments[i],
      }),
    });

    const segmentData = await segmentRes.arrayBuffer();

    // Generate filename
    filename = `${timestamp}-0${i}-segment.mp3`;

    fs.writeFile(
      `${EPISODES_DIR}/${filename}`,
      Buffer.from(segmentData),
      (err) => {
        if (err) throw err;
        console.log("The segment audio has been saved!");
      }
    );
  }

  // Process conclusion
  const conclusionRes = await fetch(
    `${TEXT_TO_SPEECH_BASE_ENDPOINT}/${ELEVEN_VOICE_IDS.ADAM}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
      } as HeadersInit,
      body: JSON.stringify({
        text: conclusion,
      }),
    }
  );

  const conclusionData = await conclusionRes.arrayBuffer();

  // Generate filename
  filename = `${timestamp}-99-conclusion.mp3`;

  fs.writeFile(
    `${EPISODES_DIR}/${filename}`,
    Buffer.from(conclusionData),
    (err) => {
      if (err) throw err;
      console.log("The conclusion audio has been saved!");
    }
  );

  console.log("Stitching files together...");

  let filenames: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    filenames.push(`${EPISODES_DIR}/${timestamp}-0${i}-segment.mp3`);
  }

  filenames.unshift(`${EPISODES_DIR}/${timestamp}-00-intro.mp3`);
  filenames.push(`${EPISODES_DIR}/${timestamp}-99-conclusion.mp3`);
  const mergedFilename = `${EPISODES_DIR}/${timestamp}-episode.mp3`;

  ffmpeg()
    .input("concat:" + filenames.join("|"))
    .audioCodec("copy")
    .on("end", async () => {
      console.log("Merging complete!");
      // Write merged file to Firebase Storage
      const bucket = firebase.storage().bucket();

      await bucket.upload(mergedFilename, {
        destination: `${timestamp}-episode.mp3`,
      });

      // Delete all files in EPISODES_DIR
      fs.readdir(EPISODES_DIR, (err, files) => {
        if (err) throw err;

        files.forEach((file) => {
          const filePath = path.join(EPISODES_DIR, file);

          fs.unlink(filePath, (err) => {
            if (err) throw err;

            console.log(`Deleted file ${filePath}`);
          });
        });
      });
    })
    .on("error", (err) => console.error("Error merging files:", err))
    .saveToFile(mergedFilename);
};

const scrapeStoryContent = async (headlines: any[]): Promise<any[]> => {
  let stories = [];

  // Collect source content for headlines
  for (const headline of headlines) {
    const url = headline.url;
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    let article = $("article").text();

    // If article contains no content, look for divs with class "Article"
    if (article.length === 0) {
      article = $(".Article").text();
      if (article.length === 0) {
        article = $(".article").text();
        if (article.length === 0) {
          article = $(".ArticleBody").text();
          if (article.length === 0) {
            article = $(".article-body").text();
            if (article.length === 0) {
              // If no article content is found, use the description
              article = headline.description;
            }
          }
        }
      }
    }

    // Format the article
    // - Remove newlines
    // - Remove extra spaces
    // - Remove HTML tags
    article = article.replace(/(\r\n|\n|\r)/gm, "");
    article = article.replace(/\s+/g, " ");
    article = article.replace(/<[^>]*>/g, "");
    article = article.replace(/ADVERTISEMENT/g, "");

    stories.push({
      source: headline.source.name,
      title: headline.title,
      description: headline.description,
      publishedAt: headline.publishedAt,
      url: headline.url,
      content: article.trim(),
    });
  }

  return stories;
};

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const headlines = await getTopHeadlines();
    const stories = await scrapeStoryContent(headlines);
    const episode = await writeEpisode(stories);
    await recordEpisode(episode);
    res.status(200).json({ message: "Episode recorded!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error });
  }
};

// Get all of the mp3 files in the public directory
const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {
  console.log("Handling GET request");

  // Get episodes from Firebase Storage
  const bucket = firebase.storage().bucket();
  const [files] = await bucket.getFiles();

  const episodes = files.map((file) => {
    return {
      name: file.name,
      url: `https://storage.googleapis.com/${bucket.name}/${file.name}`,
    };
  });

  res.status(200).json({ episodes });
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return handleGet(req, res);
    case "POST":
      return handlePost(req, res);
    default:
      res.status(405).json({ name: "Method Not Allowed" });
  }
}