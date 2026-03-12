package com.busyrev.hangman.executioner;

import com.busyrev.hangman.man.Man;

public interface Hangman {
    void hangUp(Man man);
    void applySanction(Man man);
}
