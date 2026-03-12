package com.busyrev.hangman.judiciary;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import com.busyrev.hangman.display.DrawInstruction;
import com.busyrev.hangman.executioner.Hangman;
import com.busyrev.hangman.man.Man;

public interface Judiciary {
    void pickWord(String topic);
    boolean checkLetter(String letter);
    void applyVerdict(String gameMode, String letter, Man man, Hangman hangman);
    boolean checkGuessedWord(HashSet<String> pickedLetters);
    DrawInstruction getManDrawInstruction(String gameMode, int mistakes);
    HashMap<String, String> getTopics();
    LinkedHashMap<String, String> getGameModes();
    String getGuessedWord(HashSet<String> letters);
    String getWord();
}
