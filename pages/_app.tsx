import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import type { AppProps } from "next/app";
import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjglG423-BoXoOxh4t1Y3WnQZFn5SwJS0",
  authDomain: "super-wire.firebaseapp.com",
  projectId: "super-wire",
  storageBucket: "super-wire.appspot.com",
  messagingSenderId: "901397554935",
  appId: "1:901397554935:web:38606ede951b0effcf95f2",
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);
export const storage = getStorage();

export default MyApp;
