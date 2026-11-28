// Exact SVG paths reused from the Shadow chat header.
import React from 'react';

export default function ShadowWordmark({ className = '', ...props }) {
  return (
    <svg
      className={['shadow-wordmark', className].filter(Boolean).join(' ')}
      viewBox="0 0 1255 162"
      width="1255"
      height="162"
      fill="currentColor"
      role="img"
      aria-label="Shadow"
      focusable="false"
      {...props}
    >
      <g transform="scale(1.2345 1)" fillRule="evenodd">
        <path d="M30 0h84q11 0 18 8l11 13v14H53q-12 0-12 11v6q0 8 10 10l62 12q30 6 30 35v23q0 10-7 18l-11 12H29q-11 0-19-8L0 143v-15h89q13 0 13-12v-5q0-7-9-9L31 89Q0 83 0 55V30q0-12 8-20l4-4q6-6 18-6Z"/>
        <path transform="translate(155)" d="M0 0h41v65h62V0h41v162h-41V98H41v64H0Z"/>
        <path transform="translate(307)" d="M58 0h51l53 162h-46l-10-34H58l-10 34H2Zm8 95h33L83 47Z"/>
        <path transform="translate(477)" d="M0 0h101q14 0 23 9l15 15q9 9 9 25v65q0 16-10 26l-12 12q-10 10-25 10H0Zm41 33v96h48q5 0 8-3l7-7q3-3 3-8V51q0-6-4-10l-5-5q-3-3-8-3Z"/>
        <path transform="translate(636)" d="M24 0h137c11 0 18 10 18 26v12q0 6 3 9 3 2 3 7v15q0 5-3 8-3 3-3 10v13c0 37-14 62-39 62h-18q-13 0-21-14l-3-5q-5-8-11 0l-3 5q-8 14-21 14H45c-25 0-39-25-39-62V87q0-7-3-10-3-3-3-8V54q0-5 3-7 3-3 3-9V26C6 10 13 0 24 0Zm22 33q-9 0-9 12v50c0 19 6 33 20 33h7q8 0 15-12l4-7q10-17 20 0l4 7q7 12 15 12h6c14 0 20-14 20-33V45q0-12-9-12Z"/>
        <path transform="translate(829)" d="M0 0h43l14 96 21-79h29l23 79 15-96h42l-33 162h-42l-19-69-18 69H33Z"/>
      </g>
    </svg>
  );
}
