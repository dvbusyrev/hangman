package Interface;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import Class.DrawInstruction;
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
