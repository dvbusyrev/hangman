package com.busyrev.hangman.menu;

public interface Menu {
    void chooseAction() throws InterruptedException;
    void startGame() throws InterruptedException;
    void exitGame() throws InterruptedException;
}
