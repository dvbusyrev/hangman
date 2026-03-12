package com.busyrev.hangman.display;

import java.util.HashSet;

public interface Display {
    void init(String language);
    void displayInput();
    void displayMan(DrawInstruction instr, int mistakes, String guessedWord, HashSet<String> manPickedLetters);
    void displayGameWin(DrawInstruction instr, int mistakes, String correctWord);
    void displayGameOver(int mistakes, String correctWord);
    void displayChooseAction();
    void displayIncorrectInput();
    void displayExitGame();
    void displayChooseLanguage();
    void displayChooseTopic();
    void displayChooseGameMode();
    void displayInterruption();
}
