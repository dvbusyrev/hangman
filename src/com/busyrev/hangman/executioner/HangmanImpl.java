package com.busyrev.hangman.executioner;
import com.busyrev.hangman.man.Man;

public class HangmanImpl implements Hangman {
    @Override
    public void hangUp(Man man) {
        man.hangUp();
    }

    @Override
    public void applySanction(Man man) {
        man.addMistake();
    }
}