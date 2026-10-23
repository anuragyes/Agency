import React from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

/**
 * Button — renders a <Link> when `to` is passed (internal route),
 * an <a> when `href` is passed, otherwise a regular <button>.
 */
const Button = ({ children, variant = 'primary', className = '', to, href, type = 'button', ...props }) => {
  const classes = `btn btn-${variant} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
};

export default Button;
