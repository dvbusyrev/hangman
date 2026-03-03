package Class;
import Interface.*;
import java.util.Scanner;

public class MenuImpl implements Menu {
    Game game;

    @Override
    public void chooseAction() throws InterruptedException {
        System.out.flush();
        System.out.print("""
        Input one number:
        "1" to start Game.
        "2" to end Game.
        """ +
        "> ");
        Scanner console = new Scanner(System.in);
        String choosing = console.nextLine();
        switch (choosing) {
            case "1" -> startGame();
            case "2" -> endGame();
            default -> Display.clearConsole();
        }
    }

    @Override
    public void startGame() {
        Display.clearConsole();
        Game game = new GameImpl();
        game.init();
    }

    @Override
    public void endGame() throws InterruptedException {
        Display.clearConsole();
        System.out.println("Goodbye.");
        Thread.sleep(2000);
        System.exit(0);
    }
}
