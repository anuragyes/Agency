import React from 'react';
import Navbar from '../../components/Navbar/Navbar';
import Hero from '../../components/Hero/Hero';
import Stats from '../../components/Stats/Stats';
import Features from '../../components/Features/Features';
import HowItWorks from '../../components/HowItWorks/HowItWorks';
import Pricing from '../../components/Pricing/Pricing';
import CTA from '../../components/CTA/CTA';
import Footer from '../../components/Footer/Footer';
import './HomePage.css';

const HomePage = () => (
  <div className="home-page">
    <Navbar />
    <main>
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
    </main>
    <Footer />
  </div>
);

export default HomePage;
