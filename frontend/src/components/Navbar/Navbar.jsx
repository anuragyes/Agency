import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../Button/Button';
import './Navbar.css';

const Navbar = () => {
  return (
    <header className="navbar-header">
      <nav className="navbar container">
        <Link to="/" className="navbar-logo">
          <span className="logo-icon">S</span>
          <span className="logo-text">Sociva</span>
        </Link>

        <ul className="navbar-links">
          <li><a href="#product">Product</a></li>
          <li><a href="#solutions">Solutions</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#resources">Resources</a></li>
          <li><Link to="/app/accounts">Agency</Link></li>
        </ul>

        <div className="navbar-actions">
          <Link to="/login" className="signin-link">Log in</Link>
          <Button to="/signup" variant="secondary">
            Start free trial &rarr;
          </Button>
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
