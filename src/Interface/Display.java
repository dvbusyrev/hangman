package Interface;

import java.util.HashSet;
import Class.DrawInstruction;
public interface Display {
    void init(String language);
    void input();
    void man(DrawInstruction instr, int mistakes, String guessedWord, HashSet<String> manPickedLetters);
    void gameWin(DrawInstruction instr, int mistakes, String correctWord);
    void gameOver(int mistakes, String correctWord);
    void chooseAction();
    void incorrectInput();
    void exitGame();
    void chooseLanguage();
    void chooseTopic();
    void chooseGameMode();
    void interruption();
}
