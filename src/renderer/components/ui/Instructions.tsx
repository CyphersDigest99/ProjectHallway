import React from 'react';

export const Instructions: React.FC = () => {
  return (
    <div className="instructions">
      <h3>Project Hallway</h3>
      <ul>
        <li><kbd>Scroll</kbd> Travel through tunnel</li>
        <li><kbd>Hold Right + Move</kbd> Look around</li>
        <li><kbd>Right Click</kbd> wall to add project</li>
        <li><kbd>Click</kbd> project to open directory</li>
        <li><kbd>Right Click</kbd> object for options</li>
        <li><kbd>Drag</kbd> objects, signs, lights</li>
        <li><kbd>Right Click</kbd> light for settings</li>
      </ul>
    </div>
  );
};
