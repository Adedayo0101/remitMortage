"use client";

import React from "react";

interface ProgressStepperProps {
  steps: string[];
  currentStep: number;
}

export default function ProgressStepper({ steps, currentStep }: ProgressStepperProps) {
  return (
    <div className="flex items-center w-full mb-8">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;

        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300
                  ${isCompleted ? "bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20" : ""}
                  ${isActive ? "border-2 border-cyan-400 text-cyan-400 bg-cyan-500/10" : ""}
                  ${!isCompleted && !isActive ? "border border-slate-800 text-slate-500 bg-slate-950/40" : ""}
                `}
              >
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{stepNumber}</span>
                )}
              </div>
              <p className={`mt-2 text-xs text-center font-semibold ${isActive ? "text-cyan-400" : "text-slate-500"}`}>{label}</p>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 transition-colors duration-300
                  ${currentStep > stepNumber ? "bg-cyan-400" : "bg-slate-800"}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
